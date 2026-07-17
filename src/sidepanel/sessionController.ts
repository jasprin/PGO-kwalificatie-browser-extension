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
  ChecklistItem,
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
  source: "dom" | "ai";
  rect?: { x: number; y: number; width: number; height: number };
}

export interface CaptureDraft {
  rawScreenshot: Blob;
  scenarioGuess: Scenario | undefined;
  elements: ProposedElement[];
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

  // Scenario-gok: het scenario met de meeste DOM-treffers.
  const hitsPerScenario = new Map<string, number>();
  for (const scenario of script.scenarios) {
    const hits = scenario.checklistItems.filter((i) => domMatchIds.has(i.id)).length;
    if (hits > 0) hitsPerScenario.set(scenario.id, hits);
  }
  let scenarioGuess = script.scenarios.find(
    (s) => s.id === [...hitsPerScenario.entries()].sort((a, b) => b[1] - a[1])[0]?.[0],
  );

  let aiSuggestion;
  try {
    aiSuggestion = await aiVisionProvider.suggestEvidence(rawScreenshot, {
      knownScenarios: script.scenarios,
      alreadyFoundChecklistItemIds: [...domMatchIds],
    });
  } catch {
    // Degradatie naar kaal DOM-resultaat (§8.9) — geen AI-voorstel beschikbaar.
    aiSuggestion = undefined;
  }

  if (!scenarioGuess && aiSuggestion) {
    scenarioGuess = script.scenarios.find((s) => s.id === aiSuggestion?.scenarioId);
  }

  const targetScenario = scenarioGuess ?? script.scenarios[0];
  const elements: ProposedElement[] = targetScenario.checklistItems.map((item) => {
    const domMatch = domMatches.find((m) => m.checklistItemId === item.id);
    if (domMatch) {
      return {
        checklistItemId: item.id,
        scenarioId: targetScenario.id,
        label: item.label,
        visible: true,
        confidence: domMatch.confidence,
        source: "dom",
        rect: domMatch.rect,
      };
    }
    const aiElement = aiSuggestion?.elements.find((e) => e.checklistItemId === item.id);
    return {
      checklistItemId: item.id,
      scenarioId: targetScenario.id,
      label: item.label,
      visible: aiElement?.visible ?? false,
      confidence: aiElement?.confidence ?? 0,
      explanation: aiElement?.explanation,
      source: "ai",
      // Kan ontbreken als de AI geen region opgaf — confirmEvidence valt dan
      // terug op een plaatshouder-rect (§7.1: AI levert mogelijk een ruwer
      // gebied, maar het element moet wél getekend/geteld kunnen worden).
      rect: aiElement?.roughRegion,
    };
  });

  return { rawScreenshot, scenarioGuess: targetScenario, elements };
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
