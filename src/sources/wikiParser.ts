// Parser voor een Nictiz-wiki-kwalificatiescript-pagina (PLAN.md §1.5, §8.5).
// De wiki bepaalt welke checklist-items er zijn; dit bestand haalt zowel de
// scenario-overzichtstabel als de per-scenario testdata-tabellen op en zet ze
// om naar het domeinmodel (src/shared/types.ts).
//
// Structuur is geverifieerd tegen de live pagina voor Vaccinatie-Immunisatie
// Raadplegen v2.0.4 (niet verzonnen):
// - Echte datatabellen hebben class="wikitable"; losse "let op"-meldingen
//   staan in andere tabellen (genegeerd).
// - De overzichtstabel heeft kolommen: Nr | Scenario | Doel van test |
//   Verwacht resultaat | Inhoudelijke gegevens (link naar "#Scenario_X.Y").
// - Testdata staat in secties "Scenario 1.1", "Scenario 1.2", ... (h2, id
//   "Scenario_1.1" etc.), met daarin meerdere wikitable-blokken per
//   FHIR-resource (Patient, Vaccinatie, ...). Elke datarij is, na het
//   wegfilteren van lege spacer-cellen (mediawiki gebruikt rowspan/colspan
//   voor visuele inspringing), te herkennen aan precies twee overblijvende
//   niet-lege cellen: [label, waarde].
// - Scenario 3 (herleiding) heeft geen eigen testdata-sectie; de
//   overzichtstabel verwijst voor dat scenario naar "Scenario 1.1" (bevestigd
//   op de live pagina, zie PLAN.md §8.10).

import type { ChecklistItem, QualificationScript, Scenario } from "../shared/types";
import { buildTestValue } from "./valueParsing";

export class WikiParseError extends Error {}

export async function fetchQualificationScriptHtml(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new WikiParseError(
      `Kon kwalificatiescript niet ophalen (HTTP ${response.status}) van ${url}`,
    );
  }
  return response.text();
}

export function parseQualificationScript(
  html: string,
  sourceUrl: string,
): QualificationScript {
  const doc = new DOMParser().parseFromString(html, "text/html");

  const { dataserviceName, version } = parseTitle(doc);
  const overviewTable = findOverviewTable(doc);
  const overviewRows = parseOverviewTable(overviewTable);

  const anchorCache = new Map<string, ChecklistItem[]>();
  const scenarios: Scenario[] = overviewRows.map((row) => {
    let items = anchorCache.get(row.anchorId);
    if (!items) {
      items = parseTestdataSection(doc, row.anchorId);
      anchorCache.set(row.anchorId, items);
    }
    const scenarioId = `scenario-${row.nr}`;
    return {
      id: scenarioId,
      number: row.nr,
      title: row.title,
      checklistItems: items.map((item) => ({ ...item, scenarioId })),
    };
  });

  return { sourceUrl, dataserviceName, version, scenarios };
}

function parseTitle(doc: Document): { dataserviceName: string; version: string } {
  const heading = doc.querySelector("#firstHeading")?.textContent?.trim() ?? "";
  // bv. "Vaccinatie-Immunisatie 2.0.4 - kwalificatie MedMij - Vaccinaties Raadplegen"
  const match = heading.match(/^(.*?)\s+(\d+(?:\.\d+)*)\s*-/);
  if (!match) {
    throw new WikiParseError(
      `Kon gegevensdienst-naam/versie niet uit de paginatitel halen: "${heading}"`,
    );
  }
  return { dataserviceName: match[1].trim(), version: match[2].trim() };
}

function cellTexts(row: Element): string[] {
  return Array.from(row.querySelectorAll("td, th")).map(
    (cell) => cell.textContent?.trim() ?? "",
  );
}

function findOverviewTable(doc: Document): Element {
  const tables = Array.from(doc.querySelectorAll("table.wikitable"));
  const overview = tables.find((table) => {
    const firstRow = table.querySelector("tr");
    if (!firstRow) return false;
    const texts = cellTexts(firstRow).map((t) => t.toLowerCase());
    return texts.includes("nr") && texts.some((t) => t.startsWith("scenario"));
  });
  if (!overview) {
    throw new WikiParseError(
      "Kon de scenario-overzichtstabel niet vinden (verwacht: table.wikitable met kolommen 'Nr' en 'Scenario'). Wiki-structuur mogelijk gewijzigd.",
    );
  }
  return overview;
}

interface OverviewRow {
  nr: string;
  title: string;
  anchorId: string;
}

function parseOverviewTable(table: Element): OverviewRow[] {
  const rows = Array.from(table.querySelectorAll("tr")).slice(1); // header overslaan
  const result: OverviewRow[] = [];
  for (const row of rows) {
    const cells = Array.from(row.querySelectorAll("td"));
    if (cells.length < 5) continue;
    const nr = cells[0].textContent?.trim() ?? "";
    const title = cells[1].textContent?.trim() ?? "";
    const link = cells[4].querySelector('a[href^="#Scenario"]');
    const anchorId = link?.getAttribute("href")?.replace(/^#/, "");
    if (!nr || !title || !anchorId) {
      throw new WikiParseError(
        `Onvolledige rij in scenario-overzichtstabel (nr="${nr}", title="${title}") — kon geen testdata-anker vinden.`,
      );
    }
    result.push({ nr, title, anchorId });
  }
  if (result.length === 0) {
    throw new WikiParseError("Scenario-overzichtstabel bevat geen rijen.");
  }
  return result;
}

/** Vindt alle wikitable-elementen tussen de sectiekop met `anchorId` en de
 * eerstvolgende kop van niveau h1/h2 (dat begrenst de sectie-inhoud). */
function parseTestdataSection(doc: Document, anchorId: string): ChecklistItem[] {
  // MediaWiki plaatst het id vaak op een <span> binnen de <h2>, niet op de
  // <h2> zelf — zoek dus het span en pak het bijbehorende blok-element.
  const anchorSpan = doc.getElementById(anchorId);
  const headingEl = anchorSpan?.closest("h1, h2, h3, h4, h5, h6");
  if (!headingEl) {
    throw new WikiParseError(
      `Kon testdata-sectie "${anchorId}" niet vinden op de pagina.`,
    );
  }

  const tables: Element[] = [];
  let node: Element | null = headingEl.nextElementSibling;
  while (node && !/^H[12]$/.test(node.tagName)) {
    if (node.tagName === "TABLE" && node.classList.contains("wikitable")) {
      tables.push(node);
    } else {
      tables.push(...Array.from(node.querySelectorAll("table.wikitable")));
    }
    node = node.nextElementSibling;
  }

  if (tables.length === 0) {
    throw new WikiParseError(
      `Geen data-tabellen gevonden in testdata-sectie "${anchorId}".`,
    );
  }

  const items: ChecklistItem[] = [];
  let order = 0;
  for (const table of tables) {
    for (const row of Array.from(table.querySelectorAll("tr"))) {
      const nonEmpty = cellTexts(row).filter((t) => t.length > 0);
      if (nonEmpty.length !== 2) continue; // groepskop, spacer, of iets anders
      const [label, value] = nonEmpty;
      if (
        label.toLowerCase() === "gegevenselement" &&
        value.toLowerCase() === "waarde"
      ) {
        continue; // kolomkop-rij van de tabel zelf
      }
      order += 1;
      items.push({
        id: `${anchorId}-item-${order}`,
        scenarioId: "", // wordt per scenario ingevuld door de aanroeper
        order,
        label,
        expectedValue: buildTestValue(value, label),
      });
    }
  }
  return items;
}
