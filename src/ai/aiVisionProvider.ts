// Claude vision-aanroep met kosten-escalatieladder (PLAN.md §8.4).
// Alles achter dit contract, zodat een latere centrale/backend-implementatie
// (§4.2) de rest van de extensie niet raakt.

import type {
  AiSuggestion,
  AiSuggestionElement,
  AiVisionContext,
} from "../shared/types";
import { settingsRepository } from "../storage/repositories";

export interface AiVisionProvider {
  suggestEvidence(
    screenshot: Blob,
    context: AiVisionContext,
  ): Promise<AiSuggestion>;
}

export class AiVisionUnavailableError extends Error {}

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
      "Rapporteer per verwacht data-element of het zichtbaar is op de screenshot, met toelichting.",
    input_schema: {
      type: "object",
      properties: {
        scenarioId: { type: "string" },
        elements: {
          type: "array",
          items: {
            type: "object",
            properties: {
              checklistItemId: { type: "string", enum: checklistItemIds },
              visible: { type: "boolean" },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              explanation: { type: "string" },
            },
            required: ["checklistItemId", "visible", "confidence", "explanation"],
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

Bekende scenario's en verwachte data-elementen voor deze gegevensdienst:

${scenarioLines}

${alreadyFound}

Bepaal: (a) bij welk scenario dit scherm hoort, (b) welke verwachte elementen zichtbaar zijn (concentreer je op elementen die nog NIET via tekstmatch gevonden zijn — die zijn mogelijk anders weergegeven dan de rauwe testwaarde, bv. vertaald, samengevat, of als vrije tekst), en (c) geef per element een korte toelichting voor een beoordelaar die de applicatie niet kent. Rapporteer je bevindingen via de report_evidence-tool.`;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
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

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
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

  if (!response.ok) {
    throw new AiVisionUnavailableError(
      `Claude API-aanroep mislukt (HTTP ${response.status})`,
    );
  }

  return response.json();
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

function isValidSuggestion(input: unknown): input is {
  scenarioId: string;
  elements: AiSuggestionElement[];
} {
  if (typeof input !== "object" || input === null) return false;
  const candidate = input as { scenarioId?: unknown; elements?: unknown };
  if (typeof candidate.scenarioId !== "string") return false;
  if (!Array.isArray(candidate.elements)) return false;
  return candidate.elements.every(
    (el) =>
      typeof el === "object" &&
      el !== null &&
      typeof (el as AiSuggestionElement).checklistItemId === "string" &&
      typeof (el as AiSuggestionElement).visible === "boolean" &&
      typeof (el as AiSuggestionElement).confidence === "number",
  );
}

function needsEscalation(suggestion: {
  scenarioId: string;
  elements: AiSuggestionElement[];
}): boolean {
  const visibleElements = suggestion.elements.filter((e) => e.visible);
  if (visibleElements.length === 0) return false;
  const lowConfidence = visibleElements.some(
    (e) => e.confidence < LOW_CONFIDENCE_THRESHOLD,
  );
  return lowConfidence;
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

    return { scenarioId: input.scenarioId, elements: input.elements, model: usedModel };
  }
}

export const aiVisionProvider: AiVisionProvider = new ClaudeAiVisionProvider();
