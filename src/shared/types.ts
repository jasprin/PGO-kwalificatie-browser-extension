// Kern-domeinmodel voor de extensie. Zie PLAN.md §7.1/§8 voor de achterliggende
// requirements en architectuurkeuzes.

/** Een testwaarde zoals die uit de wiki-tabel en/of FHIR-testfixture komt. */
export interface TestValue {
  raw: string;
  /** Genormaliseerde vorm t.b.v. matching (spaties/hoofdletters/diakrieten weg). */
  normalized: string;
  kind: "name" | "code" | "date" | "identifier" | "text" | "other";
  /** Voor coded values: het codesysteem (bv. "SNOMED CT", "G-Standaard HPK"). */
  codeSystem?: string;
  /** Voor coded values: de rauwe code zelf (bv. "836379009"). */
  code?: string;
  /** Voor coded values: naast de code ook de weergavetekst, als bekend. */
  displayText?: string;
  /**
   * Voor datumvelden: offset t.o.v. de T-datum, zoals in de wiki beschreven
   * (bv. "-7y", "-3y"). Wordt bij matching omgerekend naar een absolute datum
   * met de T-datum van de sessie.
   */
  tOffset?: string;
}

/** Eén regel in de checklist van een scenario (§7.1: checklist volgt scriptvolgorde). */
export interface ChecklistItem {
  id: string;
  scenarioId: string;
  /** Volgorde binnen het scenario, zoals in het kwalificatiescript. */
  order: number;
  label: string;
  expectedValue?: TestValue;
  /** FHIR-pad ter documentatie (niet gebruikt voor matching, zie §1.6). */
  fhirPath?: string;
}

export interface Scenario {
  id: string;
  /** Scenarionummer zoals in de wiki-overzichtstabel (bv. "1", "2", "3"). */
  number: string;
  title: string;
  checklistItems: ChecklistItem[];
}

export interface QualificationScript {
  sourceUrl: string;
  dataserviceName: string;
  version: string;
  scenarios: Scenario[];
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type MarkingSource = "dom" | "ai" | "manual";

/** Eén gevonden/bevestigd data-element op een screenshot. */
export interface Marking {
  checklistItemId: string;
  rect: Rect;
  source: MarkingSource;
  /** 0-1, alleen informatief; de mens beslist altijd (§3). */
  confidence?: number;
  /** Volgnummer-badge zoals getoond op de screenshot (§7.1). */
  sequenceNumber: number;
}

/** Eén vastgelegd bewijs: een screenshot + de (bevestigde) markeringen erop. */
export interface Evidence {
  id: string;
  sessionId: string;
  scenarioId: string;
  /** Verwijzing naar de opgeslagen afbeelding (ruw + gemarkeerd), zie storage. */
  rawImageKey: string;
  markedImageKey?: string;
  markings: Marking[];
  capturedAt: string;
}

export interface Session {
  id: string;
  qualificationScriptUrl: string;
  /** ISO-datum (YYYY-MM-DD), zie §7.1 T-datum-algoritme. */
  tDate: string;
  startedAt: string;
  /** Kaderkleur voor deze sessie, vastgezet bij start (§7.1). */
  markerColor: string;
}

/** Sleutel voor persisterende toelichtingen (§7.1: over-rondes-persistentie). */
export interface AnnotationKey {
  qualificationScriptUrl: string;
  scenarioId: string;
  checklistItemId: string;
}

export interface AnnotationRecord extends AnnotationKey {
  text: string;
  updatedAt: string;
}

/** Resultaat van één DOM-matching-treffer (§7.1/§8.3), in device-pixels. */
export interface DomMatchResult {
  checklistItemId: string;
  rect: Rect;
  confidence: number;
}

/** Voorstel van de AI voor één vastgelegd bewijs (§8.4). */
export interface AiSuggestionElement {
  checklistItemId: string;
  visible: boolean;
  confidence: number;
  explanation: string;
  /** Letterlijk citaat van tekst die de AI op de afbeelding zag ter onderbouwing
   * van `visible` (§8.4: anti-hallucinatie — een claim zonder citaat wordt
   * niet vertrouwd, zie aiVisionProvider.ts). */
  visualEvidence?: string;
  roughRegion?: Rect;
}

export interface AiSuggestion {
  scenarioId: string;
  elements: AiSuggestionElement[];
  /** Welk model de suggestie leverde (t.b.v. de escalatieladder, §8.4). */
  model: string;
}

export interface AiVisionContext {
  knownScenarios: Scenario[];
  /** Elementen die DOM-matching al zeker gevonden had, om dubbel werk te voorkomen. */
  alreadyFoundChecklistItemIds: string[];
}
