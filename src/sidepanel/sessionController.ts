// Orchestratielogica voor de side panel (PLAN.md §8.2: de side panel is het
// "brein" — hier leeft de sessie-state en lopen de fetch/AI/rapport-acties).

import { aiVisionProvider } from "../ai/aiVisionProvider";
import { captureVisibleTab, chooseMarkerColor, drawMarkings } from "../capture/screenshot";
import { generateReport, downloadReport } from "../report/reportGenerator";
import {
  annotationRepository,
  sessionEvidenceStore,
} from "../storage/repositories";
import { computeDefaultTDate } from "../shared/tDate";
import { fetchQualificationScriptHtml, parseQualificationScript } from "../sources/wikiParser";
import type {
  AiSuggestion,
  ChecklistItem,
  DomMatchResult,
  Evidence,
  Marking,
  QualificationScript,
  Rect,
  Scenario,
  Session,
} from "../shared/types";
import type { FindMatchesRequest, FindMatchesResponse } from "../shared/messages";

function generateId(): string {
  return crypto.randomUUID();
}

/** Onder deze drempel wordt een gevonden element wél getoond (met zijn
 * confidence/toelichting, zodat de leverancier het kan beoordelen) maar NIET
 * vooraf aangevinkt — de mens moet het dan bewust bevestigen i.p.v. bewust
 * moeten afvinken (§3, §7.1; issue #22). Onafhankelijk van het vangnet in
 * aiVisionProvider.ts: dit geldt voor zowel DOM- als AI-matches, en vangt ook
 * zwakke DOM-matchlagen (token-overlap/Levenshtein) op die wél een citaat/
 * region-equivalent hebben maar toch een laag vertrouwen verdienen. */
const AUTO_CONFIRM_CONFIDENCE_THRESHOLD = 0.85;

/** Vanaf deze dekking (fractie van de items mét een verwachte waarde in het
 * gegokte scenario, gevonden met voldoende vertrouwen) heeft DOM-matching
 * al genoeg gevonden. AI-vision is voor deze pilot-gegevensdienst vooral een
 * vangnet (PLAN.md §1.5), dus de trage/kostbare AI-call wordt dan overgeslagen
 * (issue #16). */
const SKIP_AI_COVERAGE_THRESHOLD = 0.9;

/** Plaatshouder-rect voor bevestigde elementen zonder bekende locatie (bv.
 * een AI-treffer zonder region) — gestapeld in de linkerbovenhoek, zodat het
 * element in elk geval getekend en meegeteld wordt i.p.v. stilzwijgend te
 * verdwijnen. */
function fallbackRect(index: number): Rect {
  return { x: 8, y: 8 + index * 28, width: 20, height: 20 };
}

export async function startSession(
  qualificationScriptUrl: string,
  tDateOverride?: string,
): Promise<{ session: Session; script: QualificationScript }> {
  const html = await fetchQualificationScriptHtml(qualificationScriptUrl);
  const script = parseQualificationScript(html, qualificationScriptUrl);

  const session: Session = {
    id: generateId(),
    qualificationScriptUrl,
    tDate: tDateOverride ?? computeDefaultTDate(),
    startedAt: new Date().toISOString(),
    markerColor: "", // wordt bepaald bij de eerste screenshot
  };
  await sessionEvidenceStore.createSession(session);

  // Toelichtingen van eerdere rondes voor deze gegevensdienst alvast
  // ophalen zodat de UI ze als pre-fill kan tonen (§7.1).
  await annotationRepository.getForDataservice(qualificationScriptUrl);

  return { session, script };
}

async function getActiveTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("Geen actieve tab gevonden.");
  return tab.id;
}

export interface ProposedElement {
  checklistItemId: string;
  scenarioId: string;
  label: string;
  visible: boolean;
  confidence: number;
  explanation?: string;
  visualEvidence?: string;
  source: "dom" | "ai" | "manual";
  rect?: { x: number; y: number; width: number; height: number };
}

/** Fractie van de items mét een verwachte waarde in dit scenario die
 * DOM-matching al met voldoende vertrouwen gevonden heeft — basis voor het
 * overslaan van de AI-call (issue #16). */
function domCoverageRatio(scenario: Scenario, domMatches: DomMatchResult[]): number {
  const itemsWithExpectedValue = scenario.checklistItems.filter((i) => i.expectedValue);
  if (itemsWithExpectedValue.length === 0) return 0;
  const domMatchById = new Map(domMatches.map((m) => [m.checklistItemId, m]));
  const covered = itemsWithExpectedValue.filter((item) => {
    const match = domMatchById.get(item.id);
    return match !== undefined && match.confidence >= AUTO_CONFIRM_CONFIDENCE_THRESHOLD;
  }).length;
  return covered / itemsWithExpectedValue.length;
}

/** Bepaalt welke scenario's als context naar AI-vision gestuurd worden.
 * Alleen het gegokte scenario, tenzij die gok twijfelachtig is (geen
 * DOM-hits, of meerdere scenario's met een vergelijkbare score) — dan blijft
 * alles meegestuurd zodat de AI ook kan helpen het scenario te bepalen.
 * Voorheen ging altijd de volledige lijst van alle scenario's mee (issue
 * #16), wat zowel de kosten/tijd per call als — minder voor de hand liggend —
 * de escalatieladder in aiVisionProvider.ts nadelig beïnvloedde: de
 * "gevonden ratio" die daar bepaalt of tier 2 nodig is, werd kunstmatig
 * verdund doordat die ooit over alle 92 items van 3 scenario's ging i.p.v.
 * over alleen de ~30 items die voor het huidige scherm relevant konden zijn. */
function pickAiContextScenarios(
  script: QualificationScript,
  scoresPerScenario: Map<string, number>,
  scenarioGuess: Scenario | undefined,
): Scenario[] {
  if (!scenarioGuess) return script.scenarios;
  const guessScore = scoresPerScenario.get(scenarioGuess.id) ?? 0;
  const isClearWinner = [...scoresPerScenario.entries()].every(
    ([id, score]) => id === scenarioGuess.id || score < guessScore,
  );
  return isClearWinner ? [scenarioGuess] : script.scenarios;
}

export interface CaptureDraft {
  rawScreenshot: Blob;
  scenarioGuess: Scenario | undefined;
  /** DOM- en AI-resultaten dekken ALLE scenario's (zie allItems hieronder),
   * niet alleen het gegokte scenario — bewaard zodat de leverancier het
   * scenario in de review-stap kan corrigeren zonder opnieuw te hoeven
   * capturen (zie buildReviewElements, gefixt in issue: scenario wisselen
   * liet de getoonde verwachte waarden voorheen ongewijzigd). */
  domMatches: DomMatchResult[];
  aiSuggestion: AiSuggestion | undefined;
  elements: ProposedElement[];
}

/** Projecteert de al bekende DOM/AI-resultaten op de checklist van één
 * specifiek scenario. Puur/synchroon zodat de UI dit ook kan aanroepen
 * wanneer de leverancier het scenario in de review-stap handmatig wijzigt,
 * zonder opnieuw te capturen. */
export function buildReviewElements(
  scenario: Scenario,
  domMatches: DomMatchResult[],
  aiSuggestion: AiSuggestion | undefined,
): ProposedElement[] {
  return scenario.checklistItems.map((item) => {
    const domMatch = domMatches.find((m) => m.checklistItemId === item.id);
    if (domMatch) {
      return {
        checklistItemId: item.id,
        scenarioId: scenario.id,
        label: item.label,
        visible: domMatch.confidence >= AUTO_CONFIRM_CONFIDENCE_THRESHOLD,
        confidence: domMatch.confidence,
        source: "dom",
        rect: domMatch.rect,
      };
    }
    const aiElement = aiSuggestion?.elements.find((e) => e.checklistItemId === item.id);
    const aiConfidence = aiElement?.confidence ?? 0;
    return {
      checklistItemId: item.id,
      scenarioId: scenario.id,
      label: item.label,
      visible:
        (aiElement?.visible ?? false) && aiConfidence >= AUTO_CONFIRM_CONFIDENCE_THRESHOLD,
      confidence: aiConfidence,
      explanation: aiElement?.explanation,
      visualEvidence: aiElement?.visualEvidence,
      // "manual" i.p.v. "ai" wanneer er geen AI-suggestie beschikbaar is
      // (overgeslagen, issue #16, of de call is mislukt) — anders zou
      // "0%" ten onrechte lezen als "de AI heeft gekeken en niets gevonden"
      // i.p.v. "niemand heeft dit gecontroleerd, beoordeel zelf".
      source: aiSuggestion ? "ai" : "manual",
      // Kan ontbreken als de AI geen region opgaf — confirmEvidence valt dan
      // terug op een plaatshouder-rect (§7.1: AI levert mogelijk een ruwer
      // gebied, maar het element moet wél getekend/geteld kunnen worden).
      rect: aiElement?.roughRegion,
    };
  });
}

/** Stap 3 uit de flow (§6): screenshot + hybride herkenning. Levert een
 * voorstel op dat de leverancier moet controleren/corrigeren vóór opslaan. */
export async function captureAndSuggest(
  script: QualificationScript,
  tDate: string,
): Promise<CaptureDraft> {
  const tabId = await getActiveTabId();

  const allItems: ChecklistItem[] = script.scenarios.flatMap((s) => s.checklistItems);
  const findRequest: FindMatchesRequest = { type: "find-matches", items: allItems, tDate };

  let domResponse: FindMatchesResponse | undefined;
  try {
    domResponse = await chrome.tabs.sendMessage(tabId, findRequest);
  } catch {
    // Content script (nog) niet aanwezig op deze pagina — DOM-matching
    // levert dan geen resultaten, AI-vision blijft als vangnet werken.
    domResponse = undefined;
  }

  const rawScreenshot = await captureVisibleTab();

  const domMatches = domResponse?.matches ?? [];
  const domMatchIds = new Set(domMatches.map((m) => m.checklistItemId));
  const domMatchById = new Map(domMatches.map((m) => [m.checklistItemId, m]));

  // Scenario-gok: het scenario met de hoogste opgetelde confidence, niet
  // simpelweg het aantal treffers (issue #23). Een kale hit-count behandelde
  // een treffer op een generieke productnaam (bv. hetzelfde vaccin in twee
  // scenario's, zie domMatcher.ts issue #21) even zwaar als een treffer op
  // een specifieke, patiëntgebonden waarde — waardoor twee scenario's met
  // hetzelfde vaccin bij een andere patiënt door elkaar gehaald konden
  // worden. Confidence weegt dit nu automatisch mee, zonder dat er per item
  // een aparte "is dit identificerend?"-classificatie nodig is.
  const scoresPerScenario = new Map<string, number>();
  for (const scenario of script.scenarios) {
    const score = scenario.checklistItems.reduce((sum, item) => {
      const match = domMatchById.get(item.id);
      return sum + (match?.confidence ?? 0);
    }, 0);
    if (score > 0) scoresPerScenario.set(scenario.id, score);
  }
  let scenarioGuess = script.scenarios.find(
    (s) => s.id === [...scoresPerScenario.entries()].sort((a, b) => b[1] - a[1])[0]?.[0],
  );

  // Performance (issue #16): AI-vision is voor deze pilot-gegevensdienst
  // vooral een vangnet (PLAN.md §1.5) — sla de trage/kostbare AI-call over
  // zodra DOM-matching het gegokte scenario al vrijwel volledig en met
  // voldoende vertrouwen gevonden heeft.
  const shouldSkipAi =
    scenarioGuess !== undefined &&
    domCoverageRatio(scenarioGuess, domMatches) >= SKIP_AI_COVERAGE_THRESHOLD;

  let aiSuggestion: AiSuggestion | undefined;
  if (!shouldSkipAi) {
    try {
      aiSuggestion = await aiVisionProvider.suggestEvidence(rawScreenshot, {
        // Alleen het (voldoende duidelijk) gegokte scenario meesturen i.p.v.
        // altijd alle scenario's — scheelt promptgrootte, kosten en tijd
        // (issue #16). Bij een twijfelachtige of ontbrekende gok blijft
        // alles meegaan, zodat de AI ook kan helpen het scenario te bepalen.
        knownScenarios: pickAiContextScenarios(script, scoresPerScenario, scenarioGuess),
        alreadyFoundChecklistItemIds: [...domMatchIds],
      });
    } catch {
      // Degradatie naar kaal DOM-resultaat (§8.9) — geen AI-voorstel beschikbaar.
      aiSuggestion = undefined;
    }
  }

  if (!scenarioGuess && aiSuggestion) {
    scenarioGuess = script.scenarios.find((s) => s.id === aiSuggestion?.scenarioId);
  }

  const targetScenario = scenarioGuess ?? script.scenarios[0];
  const elements = buildReviewElements(targetScenario, domMatches, aiSuggestion);

  return { rawScreenshot, scenarioGuess: targetScenario, domMatches, aiSuggestion, elements };
}

/** Stap 3 (vervolg): de leverancier heeft het voorstel gecontroleerd/
 * gecorrigeerd — teken de bevestigde markeringen en sla het bewijs op. */
export async function confirmEvidence(
  session: Session,
  draft: CaptureDraft,
  confirmedElements: ProposedElement[],
): Promise<Evidence> {
  let markerColor = session.markerColor;
  if (!markerColor) {
    markerColor = await chooseMarkerColor(draft.rawScreenshot);
    session.markerColor = markerColor;
    await sessionEvidenceStore.createSession(session);
  }

  // Belangrijk: een bevestigd zichtbaar element telt altijd mee in
  // evidence.markings — ook als er geen (betrouwbare) rect bekend is (bv. een
  // AI-treffer zonder region). Zonder dit werden zulke elementen stilzwijgend
  // niet opgeslagen, waardoor ze noch getekend werden, noch in het overzicht
  // als "aangetoond" verschenen — ontdekt tijdens het testen tegen Ivido.
  const visible = confirmedElements.filter((e) => e.visible);
  const markings: Marking[] = visible.map((element, index) => ({
    checklistItemId: element.checklistItemId,
    rect: element.rect ?? fallbackRect(index),
    source: element.source,
    confidence: element.confidence,
    sequenceNumber: index + 1,
  }));

  const markedImage =
    markings.length > 0
      ? await drawMarkings(
          draft.rawScreenshot,
          markings.map((m, i) => ({ ...m, legendLabel: String(i + 1) })),
          markerColor,
        )
      : undefined;

  const evidenceId = generateId();
  const rawImageKey = `${evidenceId}-raw`;
  const markedImageKey = markedImage ? `${evidenceId}-marked` : undefined;

  await sessionEvidenceStore.saveImage(rawImageKey, draft.rawScreenshot);
  if (markedImage && markedImageKey) {
    await sessionEvidenceStore.saveImage(markedImageKey, markedImage);
  }

  const evidence: Evidence = {
    id: evidenceId,
    sessionId: session.id,
    scenarioId: draft.scenarioGuess?.id ?? "",
    rawImageKey,
    markedImageKey,
    markings,
    capturedAt: new Date().toISOString(),
  };
  await sessionEvidenceStore.addEvidence(evidence);
  return evidence;
}

export interface OverviewRow {
  scenario: Scenario;
  item: ChecklistItem;
  shown: boolean;
  annotation?: string;
}

export async function getOverview(
  session: Session,
  script: QualificationScript,
): Promise<OverviewRow[]> {
  const evidences = await sessionEvidenceStore.getEvidenceForSession(session.id);
  const annotations = await annotationRepository.getForDataservice(
    session.qualificationScriptUrl,
  );

  const rows: OverviewRow[] = [];
  for (const scenario of script.scenarios) {
    for (const item of scenario.checklistItems) {
      const shown = evidences.some((e) =>
        e.markings.some((m) => m.checklistItemId === item.id),
      );
      const annotation = annotations.find(
        (a) => a.scenarioId === scenario.id && a.checklistItemId === item.id,
      )?.text;
      rows.push({ scenario, item, shown, annotation });
    }
  }
  return rows;
}

export async function saveAnnotation(
  session: Session,
  scenarioId: string,
  checklistItemId: string,
  text: string,
): Promise<void> {
  await annotationRepository.upsert(
    {
      qualificationScriptUrl: session.qualificationScriptUrl,
      scenarioId,
      checklistItemId,
    },
    text,
  );
}

export async function buildAndDownloadReport(
  session: Session,
  script: QualificationScript,
): Promise<void> {
  const evidences = await sessionEvidenceStore.getEvidenceForSession(session.id);
  const annotations = await annotationRepository.getForDataservice(
    session.qualificationScriptUrl,
  );

  const images = new Map<string, Blob>();
  for (const evidence of evidences) {
    const key = evidence.markedImageKey ?? evidence.rawImageKey;
    const blob = await sessionEvidenceStore.getImage(key);
    if (blob) images.set(key, blob);
  }

  const blob = await generateReport({
    qualificationScript: script,
    session,
    evidences,
    annotations,
    images,
  });

  const filename = `kwalificatiebewijs-${script.dataserviceName}-${session.tDate}.zip`;
  await downloadReport(blob, filename);
}
