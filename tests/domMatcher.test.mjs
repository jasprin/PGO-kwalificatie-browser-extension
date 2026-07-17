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

// jsdom voert geen echte layout uit — getBoundingClientRect geeft altijd
// nullen terug. De nieuwe viewport-zichtbaarheidscheck in domMatcher.ts (die
// off-canvas/scrolled-away content buiten de match houdt, zie §7.1) zou
// daardoor in deze test alles afwijzen. Voor deze test een plausibele
// niet-nul rect mocken, zodat de matchlogica zelf getest blijft i.p.v. de
// afwezige layout-engine van jsdom.
dom.window.Element.prototype.getBoundingClientRect = () => ({
  x: 0, y: 0, width: 100, height: 20, top: 0, left: 0, bottom: 20, right: 100, toJSON() {},
});
dom.window.innerWidth = 1280;
dom.window.innerHeight = 800;

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

// Regressietest voor een bug gevonden tijdens live-testen tegen Ivido: een
// open modal/detailvenster overlapt de rest van de pagina, maar tekst op de
// onderliggende pagina (bv. contactgegevens uit een ander dossieronderdeel)
// werd toch meegeteld als "gevonden" omdat die CSS-technisch niet
// display:none/visibility:hidden was. Simuleer dat hier: de achterliggende
// pagina bevat een telefoonnummer dat bij geen enkel item in dít scenario
// hoort te matchen zolang de modal ervoor staat.
const dom2 = new JSDOM(`<!doctype html><html><body>
  <div id="achtergrond">Telefoonnummer: <span>0612345678</span></div>
  <div role="dialog" style="z-index: 10;">
    <div>Achternaam: <span>XXX_Boekwijt</span></div>
  </div>
</body></html>`);
dom2.window.Element.prototype.getBoundingClientRect = () => ({
  x: 0, y: 0, width: 100, height: 20, top: 0, left: 0, bottom: 20, right: 100, toJSON() {},
});
dom2.window.innerWidth = 1280;
dom2.window.innerHeight = 800;

const itemsWithPhone = [
  ...items.slice(0, 1), // alleen "Achternaam"
  {
    id: "item-telefoon",
    scenarioId: "s1",
    order: 4,
    label: "Telefoonnummer",
    expectedValue: buildTestValue("0612345678", "Telefoonnummer"),
  },
];

const matches2 = findMatchesForChecklist(dom2.window.document.body, itemsWithPhone, tDate, 1);
const byId2 = Object.fromEntries(matches2.map((m) => [m.checklistItemId, m]));

assert(byId2["item-naam"], "achternaam binnen de modal wordt nog steeds gevonden");
assert(
  !byId2["item-telefoon"],
  "telefoonnummer op de achterliggende pagina (buiten de modal) mag NIET meetellen",
);

console.log("Alle assertions geslaagd.", matches, matches2);
