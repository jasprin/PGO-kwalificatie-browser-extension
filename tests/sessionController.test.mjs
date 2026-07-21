// Regressietest voor de pure orchestratielogica in sessionController.ts
// (issue #37) — geen chrome.*/IndexedDB-afhankelijkheid nodig, dus zonder
// mock-harnas te testen. Dekt niet captureAndSuggest/confirmEvidence zelf
// (die vereisen chrome.tabs/chrome.storage-mocks); zie de issue voor die
// afweging.
// Uitvoeren met: npx tsx tests/sessionController.test.mjs
import {
  buildReviewElements,
  domCoverageRatio,
  pickAiContextScenarios,
} from "../src/sidepanel/sessionController.ts";

function assert(condition, message) {
  if (!condition) throw new Error(`Assertie gefaald: ${message}`);
}

function item(id, overrides = {}) {
  return { id, scenarioId: "s1", order: 1, label: id, expectedValue: { raw: "x", normalized: "x", kind: "text" }, ...overrides };
}

const scenario = {
  id: "s1",
  number: "1",
  title: "Scenario 1",
  checklistItems: [item("item-a"), item("item-b"), item("item-c")],
};

// --- buildReviewElements ---

{
  const domMatches = [
    { checklistItemId: "item-a", rect: { x: 0, y: 0, width: 1, height: 1 }, confidence: 0.9 },
    { checklistItemId: "item-b", rect: { x: 0, y: 0, width: 1, height: 1 }, confidence: 0.5 },
  ];
  const elements = buildReviewElements(scenario, domMatches, undefined);
  const byId = Object.fromEntries(elements.map((e) => [e.checklistItemId, e]));

  assert(byId["item-a"].visible === true, "DOM-match >= drempel wordt automatisch aangevinkt");
  assert(byId["item-a"].source === "dom", "item-a komt uit DOM-matching");
  assert(
    byId["item-b"].visible === false,
    "DOM-match onder de drempel wordt getoond maar NIET automatisch aangevinkt",
  );
  assert(
    byId["item-c"].source === "manual",
    "geen DOM-match en geen AI-suggestie beschikbaar → 'manual', niet 'ai' met 0% (anders leest het als 'AI heeft gekeken en niets gevonden')",
  );
  assert(byId["item-c"].visible === false, "item zonder enige match staat niet aangevinkt");
}

{
  const aiSuggestion = {
    scenarioId: "s1",
    model: "test-model",
    elements: [
      { checklistItemId: "item-b", visible: true, confidence: 0.95, explanation: "" },
      { checklistItemId: "item-c", visible: true, confidence: 0.3, explanation: "" },
    ],
  };
  const elements = buildReviewElements(scenario, [], aiSuggestion);
  const byId = Object.fromEntries(elements.map((e) => [e.checklistItemId, e]));

  assert(byId["item-b"].source === "ai", "item-b komt uit de AI-suggestie");
  assert(
    byId["item-b"].visible === true,
    "AI-match >= drempel (AUTO_CONFIRM_CONFIDENCE_THRESHOLD) wordt automatisch aangevinkt",
  );
  assert(
    byId["item-c"].visible === false,
    "AI-match onder de drempel wordt getoond maar niet automatisch aangevinkt, ondanks visible:true van de AI",
  );
  assert(
    byId["item-a"].source === "ai" && byId["item-a"].visible === false,
    "item zonder AI-element in de suggestie: bron blijft 'ai' (er wás een suggestie), maar niet zichtbaar",
  );
}

// --- domCoverageRatio ---

{
  const noExpectedValue = {
    id: "s2",
    number: "2",
    title: "Scenario 2",
    checklistItems: [item("x", { expectedValue: undefined })],
  };
  assert(
    domCoverageRatio(noExpectedValue, []) === 0,
    "scenario zonder items met verwachte waarde geeft dekking 0 (geen deling door 0)",
  );
}

{
  const domMatches = [
    { checklistItemId: "item-a", rect: { x: 0, y: 0, width: 1, height: 1 }, confidence: 0.9 },
    { checklistItemId: "item-b", rect: { x: 0, y: 0, width: 1, height: 1 }, confidence: 0.5 },
  ];
  const ratio = domCoverageRatio(scenario, domMatches);
  assert(
    Math.abs(ratio - 1 / 3) < 1e-9,
    `alleen item-a haalt de confidence-drempel van de 3 items met verwachte waarde → 1/3, kreeg ${ratio}`,
  );
}

// --- pickAiContextScenarios ---

{
  const script = { sourceUrl: "u", dataserviceName: "d", version: "1", scenarios: [scenario] };
  assert(
    pickAiContextScenarios(script, new Map(), undefined) === script.scenarios,
    "zonder scenario-gok gaan alle scenario's mee als AI-context",
  );
}

{
  const scenario2 = { id: "s2", number: "2", title: "Scenario 2", checklistItems: [] };
  const script = { sourceUrl: "u", dataserviceName: "d", version: "1", scenarios: [scenario, scenario2] };
  const scores = new Map([["s1", 3], ["s2", 1]]);
  const result = pickAiContextScenarios(script, scores, scenario);
  assert(
    result.length === 1 && result[0].id === "s1",
    "eenduidige winnaar (duidelijk hoogste score) → alleen dat scenario als AI-context",
  );
}

{
  const scenario2 = { id: "s2", number: "2", title: "Scenario 2", checklistItems: [] };
  const script = { sourceUrl: "u", dataserviceName: "d", version: "1", scenarios: [scenario, scenario2] };
  const scores = new Map([["s1", 2], ["s2", 2]]);
  const result = pickAiContextScenarios(script, scores, scenario);
  assert(
    result === script.scenarios,
    "twijfelachtige gok (gelijke score als een ander scenario) → alle scenario's blijven mee als AI-context",
  );
}

console.log("Alle assertions geslaagd.");
