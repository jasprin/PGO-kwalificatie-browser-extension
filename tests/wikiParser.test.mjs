// Handmatig uit te voeren regressietest tegen een echte, opgeslagen
// kwalificatiescript-pagina (geen testframework voor de PoC, zie PLAN.md §8).
// Uitvoeren met: npx tsx tests/wikiParser.test.mjs
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dom = new JSDOM();
globalThis.DOMParser = dom.window.DOMParser;

const { parseQualificationScript } = await import("../src/sources/wikiParser.ts");

const dir = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(
  path.join(dir, "fixtures/imm-kwalificatiescript.html"),
  "utf-8",
);

const script = parseQualificationScript(html, "https://example.invalid/test");

function assert(condition, message) {
  if (!condition) throw new Error(`Assertie gefaald: ${message}`);
}

assert(script.dataserviceName === "Vaccinatie-Immunisatie", "dataservicenaam");
assert(script.version === "2.0.4", "versie");
assert(script.scenarios.length === 3, "aantal scenario's");

const [s1, s2, s3] = script.scenarios;
assert(s1.checklistItems.length === 18, "scenario 1 aantal items");
assert(s2.checklistItems.length === 56, "scenario 2 aantal items");
assert(
  s3.checklistItems.length === s1.checklistItems.length,
  "scenario 3 hergebruikt scenario 1.1's dataset (§1.5/§8.10, bevestigd tegen de live wiki)",
);

const geboortedatum = s2.checklistItems.find((i) => i.label === "Geboortedatum");
assert(geboortedatum?.expectedValue?.raw === "T - 68 jaar", "T-offset geboortedatum scenario 2");
assert(geboortedatum?.expectedValue?.kind === "date", "kind geboortedatum");

const productCode = s1.checklistItems.find((i) => i.label === "Product code");
assert(productCode?.expectedValue?.kind === "code", "kind product code");
assert(productCode?.expectedValue?.codeSystem === "SNOMED CT", "codeSystem product code");

// Issue #28: scenario 1 bevat twee vaccinatie-bundels — zonder onderscheid
// zouden "Product code"/"Batchnummer"/etc. tweemaal identiek gelabeld zijn,
// zonder dat te zien is welke vaccinatie ontbreekt.
const productCodes = s1.checklistItems.filter((i) => i.label === "Product code");
assert(
  productCodes.length === 3,
  `verwacht 3 'Product code'-items in scenario 1 (1 in de eerste vaccinatie, 2 in de tweede), kreeg ${productCodes.length}`,
);
assert(
  productCodes.every((i) => i.bundleLabel),
  "alle 'Product code'-items hebben een bundleLabel",
);
const distinctBundleLabels = new Set(productCodes.map((i) => i.bundleLabel));
assert(
  distinctBundleLabels.size === 2,
  `de 'Product code'-items moeten over precies 2 verschillende bundels verdeeld zijn (kreeg: ${[...distinctBundleLabels].join(", ")})`,
);

const achternaam = s1.checklistItems.find((i) => i.label === "Achternaam");
assert(
  achternaam?.bundleLabel === undefined,
  "een item uit een bundel die maar één keer voorkomt (Patient) krijgt geen bundleLabel",
);

console.log("Alle assertions geslaagd.");
