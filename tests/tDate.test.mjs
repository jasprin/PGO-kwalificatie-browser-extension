import { computeDefaultTDate } from "../src/shared/tDate.ts";

function assert(condition, message) {
  if (!condition) throw new Error(`Assertie gefaald: ${message}`);
}

// donderdag 2026-07-16 -> maandag van die week is 2026-07-13
assert(computeDefaultTDate(new Date("2026-07-16T12:00:00")) === "2026-07-13", "donderdag -> afgelopen maandag");
// maandag zelf -> vandaag
assert(computeDefaultTDate(new Date("2026-07-13T09:00:00")) === "2026-07-13", "maandag -> vandaag");
// zondag -> maandag van dezelfde week (6 dagen terug)
assert(computeDefaultTDate(new Date("2026-07-19T23:00:00")) === "2026-07-13", "zondag -> maandag van diezelfde week");

console.log("Alle assertions geslaagd.");
