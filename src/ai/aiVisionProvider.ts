// Claude vision-aanroep met kosten-escalatieladder (PLAN.md §8.4).
// Alles achter dit contract, zodat een latere centrale/backend-implementatie
// (§4.2) de rest van de extensie niet raakt.

import type {
  AiSuggestion,
  AiSuggestionElement,
  AiVisionContext,
  Rect,
} from "../shared/types";
import { settingsRepository } from "../storage/repositories";

export interface AiVisionProvider {
  suggestEvidence(
    screenshot: Blob,
    context: AiVisionContext,
  ): Promise<AiSuggestion>;
}

export class AiVisionUnavailableError extends Error {}

/** Aparte subklasse voor een (vermoedelijk) ongeldige/geweigerde API-key
 * (issue #13) — in tegenstelling tot een tijdelijke netwerk-/serverfout heeft
 * opnieuw proberen hier geen zin, en de gebruiker moet naar de opties-pagina
 * verwezen worden i.p.v. blind te retryen. */
export class AiVisionAuthError extends AiVisionUnavailableError {}

/** Overige 4xx-fouten (issue #25): het verzoek zelf is ongeldig (bv. een
 * verkeerd modelnaam of schema), dat verandert niet door het nog eens te
 * proberen — in tegenstelling tot een tijdelijke netwerk-/5xx-fout. */
export class AiVisionClientError extends AiVisionUnavailableError {}

// Foutafhandeling voor de Claude-aanroep (issue #13, "minimale, niet-
// overengineerde foutafhandeling"): een enkele hapering (netwerkblip,
// tijdelijke 5xx, timeout) mag niet meteen de hele AI-vangnet-laag laten
// afvallen. Een ongeldige key of een andere 4xx-fout is niet retrybaar.
const MAX_CLAUDE_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;
const REQUEST_TIMEOUT_MS = 20_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Escalatieladder (besloten, geen vast model): goedkoop/snel als standaard,
// opschalen naar een sterker model bij weinig DOM-matches, laag
// zelf-vertrouwen, of een antwoord dat niet aan het schema voldoet.
const TIER1_MODEL = "claude-haiku-4-5";
const TIER2_MODEL = "claude-opus-4-8";
const LOW_CONFIDENCE_THRESHOLD = 0.6;
const FEW_DOM_MATCHES_RATIO = 0.5;

const TOOL_NAME = "report_evidence";

function buildTool(checklistItemIds: string[]) {
  return {
    name: TOOL_NAME,
    description:
      "Rapporteer per verwacht data-element of het zichtbaar is op de screenshot, met een citaat als bewijs.",
    input_schema: {
      type: "object",
      properties: {
        scenarioId: { type: "string" },
        elements: {
          type: "array",
          items: {
            type: "object",
            // Bewuste volgorde (§8.4, anti-hallucinatie): visualEvidence staat
            // vóór visible/confidence in het schema, zodat het model eerst een
            // citaat "vastlegt" en pas daarna een oordeel geeft — i.p.v. een
            // oordeel te geven en dat achteraf te rationaliseren. Los daarvan
            // wordt een ontbrekend citaat hieronder (suggestEvidence) hoe dan
            // ook hard afgedwongen, ongeacht of het model deze volgorde/instructie
            // negeert.
            properties: {
              checklistItemId: { type: "string", enum: checklistItemIds },
              visualEvidence: {
                type: "string",
                description:
                  'Citeer EXACT de tekst zoals die letterlijk op de afbeelding staat en die dit element bewijst (bv. de daadwerkelijk getoonde datum/naam/code). Laat leeg ("") als je niets op de afbeelding kunt aanwijzen. Verzin nooit een citaat — een verwachte waarde die je hierboven in de lijst zag staan is GEEN citaat van de afbeelding.',
              },
              visible: {
                type: "boolean",
                description:
                  "Alleen true als visualEvidence een echt citaat van de afbeelding bevat. Bij een lege visualEvidence moet dit false zijn.",
              },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              explanation: { type: "string" },
              region: {
                type: "object",
                description:
                  "Verplicht als visible=true: waar op de afbeelding het element staat, als fractie (0-1) van breedte/hoogte. Kun je geen locatie aanwijzen, rapporteer dan visible=false.",
                properties: {
                  x: { type: "number", minimum: 0, maximum: 1 },
                  y: { type: "number", minimum: 0, maximum: 1 },
                  width: { type: "number", minimum: 0, maximum: 1 },
                  height: { type: "number", minimum: 0, maximum: 1 },
                },
                required: ["x", "y", "width", "height"],
              },
            },
            required: [
              "checklistItemId",
              "visualEvidence",
              "visible",
              "confidence",
              "explanation",
            ],
          },
        },
      },
      required: ["scenarioId", "elements"],
    },
  };
}

function buildPrompt(context: AiVisionContext): string {
  const scenarioLines = context.knownScenarios
    .map((scenario) => {
      const items = scenario.checklistItems
        .map(
          (item) =>
            `  - [${item.id}] ${item.label}${
              item.expectedValue ? ` (verwacht: "${item.expectedValue.raw}")` : ""
            }`,
        )
        .join("\n");
      return `Scenario ${scenario.number} (${scenario.id}): ${scenario.title}\n${items}`;
    })
    .join("\n\n");

  const alreadyFound =
    context.alreadyFoundChecklistItemIds.length > 0
      ? `Al gevonden via letterlijke tekstmatch (geen interpretatie meer nodig): ${context.alreadyFoundChecklistItemIds.join(", ")}`
      : "Nog niets gevonden via letterlijke tekstmatch.";

  return `Je krijgt een screenshot van een Persoonlijke Gezondheidsomgeving (PGO) tijdens een MedMij-kwalificatietest. Alle getoonde data is fictieve testdata, geen echte patiëntgegevens.

Bekende scenario's en verwachte data-elementen voor deze gegevensdienst — deze lijst dient UITSLUITEND om afwijkend weergegeven waarden te herkennen (bv. een andere datumnotatie of een afkorting). De lijst is geen bevestiging dat een element zichtbaar is:

${scenarioLines}

${alreadyFound}

Lees dit aandachtig, het is de kern van je taak:
- Op één schermafbeelding is meestal maar een klein deel van bovenstaande lijst daadwerkelijk zichtbaar. Voor de meeste elementen is visible=false het juiste antwoord — dat is normaal, geen falen.
- Ga er NOOIT van uit dat een element zichtbaar is enkel omdat het hierboven genoemd wordt. Bekijk per element daadwerkelijk de afbeelding.
- Vul visualEvidence altijd EERST in met een letterlijk citaat van tekst die je op de afbeelding ziet staan. Kun je niets citeren, dan is visible=false en visualEvidence leeg. Verzin nooit een citaat — het overnemen van de verwachte waarde uit de lijst hierboven telt niet als citaat van de afbeelding.
- Een onterecht "zichtbaar" gerapporteerd element is voor deze kwalificatietest schadelijker dan een gemist element: een gemist element kan de gebruiker zelf alsnog aanvinken, maar een fout "gevonden" element ondermijnt de betrouwbaarheid van het hele bewijsrapport. Wees dus conservatief: bij twijfel altijd visible=false.

Bepaal: (a) bij welk scenario dit scherm hoort, (b) welke verwachte elementen daadwerkelijk zichtbaar zijn (concentreer je op elementen die nog NIET via tekstmatch gevonden zijn — die zijn mogelijk anders weergegeven dan de rauwe testwaarde, bv. vertaald, samengevat, of als vrije tekst), (c) citeer per zichtbaar element de letterlijke tekst (visualEvidence) en geef een korte toelichting voor een beoordelaar die de applicatie niet kent, en (d) geef voor elk zichtbaar element ook een region (fractie 0-1 van breedte/hoogte van de afbeelding) van waar het ongeveer staat. Rapporteer je bevindingen via de report_evidence-tool.`;
}

// Chunked i.p.v. byte-voor-byte (issue #39): een screenshot kan een paar MB
// zijn, en String.fromCharCode(...bytes) in één keer op zo'n grote array
// loopt tegen de argumentenlimiet van de JS-engine aan — vandaar blokken van
// CHUNK_SIZE, ruim daaronder.
const BASE64_CHUNK_SIZE = 0x8000;

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK_SIZE));
  }
  return btoa(binary);
}

async function callClaude(
  model: string,
  screenshotBase64: string,
  context: AiVisionContext,
  apiKey: string,
): Promise<unknown> {
  const checklistItemIds = context.knownScenarios.flatMap((s) =>
    s.checklistItems.map((i) => i.id),
  );

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_CLAUDE_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          // Vereist voor een rechtstreekse browseraanroep (§8.4) — bewust
          // geaccepteerd risico voor deze single-user PoC met fictieve testdata.
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          tools: [buildTool(checklistItemIds)],
          tool_choice: { type: "tool", name: TOOL_NAME },
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: "image/png",
                    data: screenshotBase64,
                  },
                },
                { type: "text", text: buildPrompt(context) },
              ],
            },
          ],
        }),
      });

      if (response.status === 401 || response.status === 403) {
        // Niet retrybaar: een verkeerde key wordt niet goed door het nog een
        // keer te proberen.
        throw new AiVisionAuthError(
          `Claude API-key geweigerd (HTTP ${response.status}). Controleer de key via de opties-pagina.`,
        );
      }

      if (response.status >= 400 && response.status < 500) {
        // Niet retrybaar: een 4xx betekent dat het verzoek zelf ongeldig is
        // (bv. een fout schema of modelnaam) — dat lost herhalen niet op.
        throw new AiVisionClientError(
          `Claude API-aanroep mislukt (HTTP ${response.status}) — verzoek is ongeldig.`,
        );
      }

      if (!response.ok) {
        throw new AiVisionUnavailableError(
          `Claude API-aanroep mislukt (HTTP ${response.status})`,
        );
      }

      return await response.json();
    } catch (error) {
      if (error instanceof AiVisionAuthError || error instanceof AiVisionClientError) {
        throw error;
      }
      lastError = error;
      if (attempt < MAX_CLAUDE_ATTEMPTS) {
        await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
        continue;
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new AiVisionUnavailableError(
    `Claude API niet bereikbaar na ${MAX_CLAUDE_ATTEMPTS} pogingen: ${reason}`,
  );
}

function extractToolInput(apiResponse: unknown): Record<string, unknown> | undefined {
  const content = (apiResponse as { content?: unknown[] })?.content;
  if (!Array.isArray(content)) return undefined;
  const toolUse = content.find(
    (block): block is { type: "tool_use"; input: Record<string, unknown> } =>
      typeof block === "object" &&
      block !== null &&
      (block as { type?: string }).type === "tool_use",
  );
  return toolUse?.input;
}

interface RawRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RawSuggestionElement {
  checklistItemId: string;
  visible: boolean;
  confidence: number;
  explanation?: string;
  visualEvidence?: string;
  region?: RawRegion;
}

interface RawSuggestion {
  scenarioId: string;
  elements: RawSuggestionElement[];
}

function isValidSuggestion(input: unknown): input is RawSuggestion {
  if (typeof input !== "object" || input === null) return false;
  const candidate = input as { scenarioId?: unknown; elements?: unknown };
  if (typeof candidate.scenarioId !== "string") return false;
  if (!Array.isArray(candidate.elements)) return false;
  return candidate.elements.every(
    (el) =>
      typeof el === "object" &&
      el !== null &&
      typeof (el as RawSuggestionElement).checklistItemId === "string" &&
      typeof (el as RawSuggestionElement).visible === "boolean" &&
      typeof (el as RawSuggestionElement).confidence === "number",
  );
}

/** Rekent de door de AI gerapporteerde fractionele region (0-1) om naar een
 * pixel-Rect t.o.v. de daadwerkelijke afbeeldingsgrootte (§7.1: AI-vision
 * levert mogelijk een ruwer gebied dan DOM-matching, maar moet wél iets
 * leveren zodat het element getekend en meegeteld kan worden). */
function regionToPixelRect(
  region: RawRegion | undefined,
  imageWidth: number,
  imageHeight: number,
): Rect | undefined {
  if (!region) return undefined;
  return {
    x: region.x * imageWidth,
    y: region.y * imageHeight,
    width: region.width * imageWidth,
    height: region.height * imageHeight,
  };
}

async function getImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;
  bitmap.close();
  return { width, height };
}

/** Een "zichtbaar"-claim zonder citaat en zonder locatie is per definitie niet
 * onderbouwd (§8.4, anti-hallucinatie) — ongeacht de gerapporteerde confidence. */
function isGrounded(element: RawSuggestionElement): boolean {
  return Boolean(element.region) && Boolean(element.visualEvidence?.trim());
}

function needsEscalation(suggestion: RawSuggestion): boolean {
  const visibleElements = suggestion.elements.filter((e) => e.visible);
  if (visibleElements.length === 0) return false;
  const lowConfidence = visibleElements.some(
    (e) => e.confidence < LOW_CONFIDENCE_THRESHOLD,
  );
  const ungrounded = visibleElements.some((e) => !isGrounded(e));
  return lowConfidence || ungrounded;
}

class ClaudeAiVisionProvider implements AiVisionProvider {
  async suggestEvidence(
    screenshot: Blob,
    context: AiVisionContext,
  ): Promise<AiSuggestion> {
    const apiKey = await settingsRepository.getApiKey();
    if (!apiKey) {
      throw new AiVisionUnavailableError(
        "Geen Claude API-key ingesteld. Stel deze in via de opties-pagina.",
      );
    }

    const screenshotBase64 = await blobToBase64(screenshot);

    const totalItems = context.knownScenarios.reduce(
      (sum, s) => sum + s.checklistItems.length,
      0,
    );
    const foundRatio =
      totalItems === 0
        ? 1
        : context.alreadyFoundChecklistItemIds.length / totalItems;
    const startWithTier2 = foundRatio < FEW_DOM_MATCHES_RATIO;

    const firstModel = startWithTier2 ? TIER2_MODEL : TIER1_MODEL;
    let response = await callClaude(firstModel, screenshotBase64, context, apiKey);
    let input = extractToolInput(response);
    let usedModel = firstModel;

    const shouldEscalate =
      firstModel === TIER1_MODEL &&
      (!isValidSuggestion(input) || needsEscalation(input));

    if (shouldEscalate) {
      response = await callClaude(TIER2_MODEL, screenshotBase64, context, apiKey);
      input = extractToolInput(response);
      usedModel = TIER2_MODEL;
    }

    if (!isValidSuggestion(input)) {
      throw new AiVisionUnavailableError(
        "Claude-antwoord voldeed niet aan het verwachte schema, ook na escalatie.",
      );
    }

    const { width, height } = await getImageDimensions(screenshot);
    // Hard vangnet (§8.4, direct gemotiveerd door een bevestigde hallucinatie
    // tijdens live-testen tegen Ivido, issue #18): een claim "visible: true"
    // zonder citaat + locatie wordt hier ALTIJD teruggezet naar niet-zichtbaar,
    // los van of het model de prompt-instructie om conservatief te zijn heeft
    // gevolgd. De oorspronkelijke toelichting van de AI blijft zichtbaar voor
    // de reviewer, zodat niets stilzwijgend verdwijnt — de mens beslist alsnog
    // (PLAN.md §3), maar het vinkje staat niet ten onrechte al aan.
    const elements: AiSuggestionElement[] = input.elements.map((el) => {
      const grounded = isGrounded(el);
      const visible = el.visible && grounded;
      const explanation =
        el.visible && !grounded
          ? `[Automatisch afgewezen: geen citaat/locatie als onderbouwing] ${el.explanation ?? ""}`.trim()
          : (el.explanation ?? "");
      return {
        checklistItemId: el.checklistItemId,
        visible,
        confidence: visible ? el.confidence : 0,
        explanation,
        visualEvidence: el.visualEvidence,
        roughRegion: regionToPixelRect(el.region, width, height),
      };
    });

    return { scenarioId: input.scenarioId, elements, model: usedModel };
  }
}

export const aiVisionProvider: AiVisionProvider = new ClaudeAiVisionProvider();
