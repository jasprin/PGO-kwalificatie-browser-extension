// Smoke-test voor de rapportgenerator (§8.7). Uitvoeren met:
// npx tsx tests/reportGenerator.test.mjs
import JSZip from "jszip";
import { generateReport } from "../src/report/reportGenerator.ts";

function assert(condition, message) {
  if (!condition) throw new Error(`Assertie gefaald: ${message}`);
}

const scenario = {
  id: "scenario-1",
  number: "1",
  title: "Test scenario",
  checklistItems: [
    { id: "item-1", scenarioId: "scenario-1", order: 1, label: "Achternaam" },
    { id: "item-2", scenarioId: "scenario-1", order: 2, label: "Vaccin" },
  ],
};

const evidence = {
  id: "ev-1",
  sessionId: "session-1",
  scenarioId: "scenario-1",
  rawImageKey: "raw-1",
  markedImageKey: "marked-1",
  markings: [
    { checklistItemId: "item-1", rect: { x: 0, y: 0, width: 10, height: 10 }, source: "dom", sequenceNumber: 1 },
  ],
  capturedAt: new Date().toISOString(),
};

// Node kent geen FileReader, waar JSZip intern op leunt om een Blob te lezen
// (in de browser, waar de extensie echt draait, is dat wel beschikbaar) —
// voor deze test daarom een kale ArrayBuffer i.p.v. een Blob.
const fakePngBytes = new Uint8Array([137, 80, 78, 71]).buffer;
const images = new Map([["marked-1", fakePngBytes]]);

const blob = await generateReport({
  qualificationScript: {
    sourceUrl: "https://example.invalid",
    dataserviceName: "Test-dienst",
    version: "1.0",
    scenarios: [scenario],
  },
  session: { id: "session-1", qualificationScriptUrl: "https://example.invalid", tDate: "2026-07-13", startedAt: new Date().toISOString(), markerColor: "#e6007e" },
  evidences: [evidence],
  annotations: [{ qualificationScriptUrl: "https://example.invalid", scenarioId: "scenario-1", checklistItemId: "item-2", text: "Niet van toepassing", updatedAt: new Date().toISOString() }],
  images,
});

assert(blob instanceof Blob, "resultaat is een Blob");

const zip = await JSZip.loadAsync(await blob.arrayBuffer());
assert(zip.file("report.html") !== null, "report.html zit in de zip");
assert(zip.file("metadata.json") !== null, "metadata.json zit in de zip");
assert(zip.file("shots/shot-1.png") !== null, "screenshot zit in de zip");

const html = await zip.file("report.html").async("string");
assert(html.includes('id="item-item-1"'), "checklist-item-anker aanwezig in HTML");
assert(html.includes('id="shot-ev-1"'), "screenshot-anker aanwezig in HTML");
assert(html.includes("Aangetoond"), "aangetoond-status aanwezig");
assert(html.includes("Niet van toepassing"), "toelichting bij ontbrekend element aanwezig");

const metadata = JSON.parse(await zip.file("metadata.json").async("string"));
assert(metadata.scenarios[0].items[0].shown === true, "metadata: item 1 aangetoond");
assert(metadata.scenarios[0].items[1].shown === false, "metadata: item 2 ontbrekend");

console.log("Alle assertions geslaagd.");
