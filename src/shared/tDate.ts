// T-datum-algoritme (PLAN.md §7.1): maandag van de huidige week, als voorstel
// bij sessiestart — corrigeerbaar door de leverancier, en vastgezet voor de
// rest van de sessie (geen herberekening bij een middernacht-/weekgrens).

/** ISO-weekdag: maandag = 1 ... zondag = 7. */
function isoWeekday(date: Date): number {
  const day = date.getDay(); // zondag = 0 ... zaterdag = 6
  return day === 0 ? 7 : day;
}

function toIsoDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Berekent T = meest recente maandag (incl. vandaag als het al maandag is),
 * op basis van de lokale datum van de leverancier (browser-lokale tijd). */
export function computeDefaultTDate(now: Date = new Date()): string {
  const weekday = isoWeekday(now);
  const monday = new Date(now);
  monday.setDate(now.getDate() - (weekday - 1));
  return toIsoDateString(monday);
}
