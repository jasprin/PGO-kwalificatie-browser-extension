// Handmatige regressietest voor de DOM-matcher tegen een synthetische pagina.
// Uitvoeren met: npx tsx tests/domMatcher.test.mjs
import { JSDOM } from "jsdom";

const dom = new JSDOM(`<!doctype html><html><body>
  <div>Achternaam: <span>XXX_Boekwijt</span></div>
  <div>Vaccin: <span>COVID-19 vaccin AstraZeneca</span></div>
  <div>Geboortedatum: <span>30-06-2009</span></div>
</body></html>`);
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;
globalThis.NodeFilter = dom.window.NodeFilter;

const { findMatchesForChecklist } = await import("../src/content/domMatcher.ts");
const { buildTestValue } = await import("../src/sources/valueParsing.ts");

function assert(condition, message) {
  if (!condition) throw new Error(`Assertie gefaald: ${message}`);
}

const items = [
  {
    id: "item-naam",
    scenarioId: "s1",
    order: 1,
    label: "Achternaam",
    expectedValue: buildTestValue("XXX_Boekwijt", "Achternaam"),
  },
  {
    id: "item-vaccin",
    scenarioId: "s1",
    order: 2,
    label: "Product code",
    expectedValue: buildTestValue(
      "COVID-19 VACCIN ASTRAZENECA INJVLST (code = '2925508' in codeSystem 'G-Standaard HPK')",
      "Product code",
    ),
  },
  {
    id: "item-datum",
    scenarioId: "s1",
    order: 3,
    label: "Geboortedatum",
    expectedValue: buildTestValue("T - 17 jaar", "Geboortedatum"),
  },
];

// T-datum zodanig gekozen dat T - 17 jaar exact op 30-06-2009 uitkomt.
const tDate = "2026-06-30";

const matches = findMatchesForChecklist(dom.window.document.body, items, tDate, 1);
const byId = Object.fromEntries(matches.map((m) => [m.checklistItemId, m]));

assert(byId["item-naam"], "naam-match gevonden");
assert(byId["item-vaccin"], "vaccin-match gevonden (code-vs-weergavetekst)");
assert(byId["item-datum"], "datum-match gevonden (T-offset omgerekend)");

console.log("Alle assertions geslaagd.", matches);
