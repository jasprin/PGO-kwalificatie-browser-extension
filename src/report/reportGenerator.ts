// Rapportgenerator (PLAN.md §7.1, §8.7): zelfstandig HTML-rapport (geen
// framework — moet lokaal openen bij een beoordelaar zonder server) +
// screenshots als losse bestanden + JSON-metadata, verpakt in één zip.

import JSZip from "jszip";
import type {
  AnnotationRecord,
  Evidence,
  QualificationScript,
  Scenario,
  Session,
} from "../shared/types";

export interface ReportInput {
  qualificationScript: QualificationScript;
  session: Session;
  evidences: Evidence[];
  annotations: AnnotationRecord[];
  /** Afbeeldingen, gesleuteld op Evidence.markedImageKey (of rawImageKey als
   * er geen markeringen zijn). */
  images: Map<string, Blob>;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function annotationFor(
  annotations: AnnotationRecord[],
  scenarioId: string,
  checklistItemId: string,
): string | undefined {
  return annotations.find(
    (a) => a.scenarioId === scenarioId && a.checklistItemId === checklistItemId,
  )?.text;
}

function buildScenarioSection(
  scenario: Scenario,
  evidences: Evidence[],
  evidenceFilenames: Map<string, string>,
  annotations: AnnotationRecord[],
): string {
  const rows = scenario.checklistItems
    .map((item) => {
      const relatedEvidences = evidences.filter((e) =>
        e.markings.some((m) => m.checklistItemId === item.id),
      );
      const shown = relatedEvidences.length > 0;
      const links = relatedEvidences
        .map((e) => {
          const filename = evidenceFilenames.get(e.id);
          return `<a href="#shot-${e.id}">${escapeHtml(filename ?? e.id)}</a>`;
        })
        .join(", ");
      const annotation = annotationFor(annotations, scenario.id, item.id);
      const statusText = shown
        ? `Aangetoond (${links})`
        : annotation
          ? `Ontbrekend — toelichting: ${escapeHtml(annotation)}`
          : "Ontbrekend";
      return `<tr id="item-${item.id}">
        <td>${item.order}</td>
        <td>${escapeHtml(item.label)}</td>
        <td>${statusText}</td>
      </tr>`;
    })
    .join("\n");

  return `<section>
    <h2>Scenario ${escapeHtml(scenario.number)}: ${escapeHtml(scenario.title)}</h2>
    <table class="checklist">
      <thead><tr><th>#</th><th>Data-element</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

function buildEvidenceSection(
  evidence: Evidence,
  filename: string,
  scenario: Scenario | undefined,
): string {
  const legendItems = [...evidence.markings]
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber)
    .map((marking) => {
      const item = scenario?.checklistItems.find(
        (i) => i.id === marking.checklistItemId,
      );
      return `<li><a href="#item-${marking.checklistItemId}">${marking.sequenceNumber}. ${escapeHtml(item?.label ?? marking.checklistItemId)}</a></li>`;
    })
    .join("\n");

  return `<figure id="shot-${evidence.id}">
    <img src="shots/${filename}" alt="Bewijs voor scenario ${escapeHtml(scenario?.number ?? "")}" />
    <figcaption>
      <strong>Scenario ${escapeHtml(scenario?.number ?? "?")}</strong> — vastgelegd op ${escapeHtml(evidence.capturedAt)}
      <ol>${legendItems}</ol>
    </figcaption>
  </figure>`;
}

const STYLE = `
  body { font-family: system-ui, sans-serif; max-width: 960px; margin: 2rem auto; padding: 0 1rem; }
  table.checklist { width: 100%; border-collapse: collapse; margin-bottom: 2rem; }
  table.checklist th, table.checklist td { border: 1px solid #ccc; padding: 0.4rem 0.6rem; text-align: left; }
  figure { margin: 0 0 2rem 0; }
  figure img { max-width: 100%; border: 1px solid #ccc; }
  figcaption ol { margin: 0.5rem 0 0 1.2rem; padding: 0; }
`;

function buildHtml(
  input: ReportInput,
  evidenceFilenames: Map<string, string>,
): string {
  const scenarioSections = input.qualificationScript.scenarios
    .map((scenario) =>
      buildScenarioSection(
        scenario,
        input.evidences,
        evidenceFilenames,
        input.annotations,
      ),
    )
    .join("\n");

  const evidenceSections = input.evidences
    .map((evidence) => {
      const filename = evidenceFilenames.get(evidence.id) ?? "";
      const scenario = input.qualificationScript.scenarios.find(
        (s) => s.id === evidence.scenarioId,
      );
      return buildEvidenceSection(evidence, filename, scenario);
    })
    .join("\n");

  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8" />
<title>Kwalificatiebewijs — ${escapeHtml(input.qualificationScript.dataserviceName)}</title>
<style>${STYLE}</style>
</head>
<body>
<h1>Kwalificatiebewijs: ${escapeHtml(input.qualificationScript.dataserviceName)} v${escapeHtml(input.qualificationScript.version)}</h1>
<p>T-datum van deze sessie: ${escapeHtml(input.session.tDate)}</p>
<h2>Checklist per scenario</h2>
${scenarioSections}
<h2>Screenshots</h2>
${evidenceSections}
</body>
</html>`;
}

interface ReportMetadata {
  dataservice: string;
  version: string;
  tDate: string;
  scenarios: Array<{
    id: string;
    number: string;
    title: string;
    items: Array<{
      id: string;
      label: string;
      shown: boolean;
      evidenceIds: string[];
      annotation?: string;
    }>;
  }>;
  evidences: Array<{
    id: string;
    filename: string;
    scenarioId: string;
    capturedAt: string;
    markings: Array<{
      checklistItemId: string;
      sequenceNumber: number;
      source: string;
    }>;
  }>;
}

function buildMetadata(
  input: ReportInput,
  evidenceFilenames: Map<string, string>,
): ReportMetadata {
  return {
    dataservice: input.qualificationScript.dataserviceName,
    version: input.qualificationScript.version,
    tDate: input.session.tDate,
    scenarios: input.qualificationScript.scenarios.map((scenario) => ({
      id: scenario.id,
      number: scenario.number,
      title: scenario.title,
      items: scenario.checklistItems.map((item) => {
        const relatedEvidences = input.evidences.filter((e) =>
          e.markings.some((m) => m.checklistItemId === item.id),
        );
        return {
          id: item.id,
          label: item.label,
          shown: relatedEvidences.length > 0,
          evidenceIds: relatedEvidences.map((e) => e.id),
          annotation: annotationFor(input.annotations, scenario.id, item.id),
        };
      }),
    })),
    evidences: input.evidences.map((evidence) => ({
      id: evidence.id,
      filename: evidenceFilenames.get(evidence.id) ?? "",
      scenarioId: evidence.scenarioId,
      capturedAt: evidence.capturedAt,
      markings: evidence.markings.map((m) => ({
        checklistItemId: m.checklistItemId,
        sequenceNumber: m.sequenceNumber,
        source: m.source,
      })),
    })),
  };
}

export async function generateReport(input: ReportInput): Promise<Blob> {
  const zip = new JSZip();
  const shotsFolder = zip.folder("shots");
  if (!shotsFolder) throw new Error("Kon shots-map niet aanmaken in de zip.");

  const evidenceFilenames = new Map<string, string>();
  input.evidences.forEach((evidence, index) => {
    const filename = `shot-${index + 1}.png`;
    evidenceFilenames.set(evidence.id, filename);
    const imageKey = evidence.markedImageKey ?? evidence.rawImageKey;
    const blob = input.images.get(imageKey);
    if (blob) shotsFolder.file(filename, blob);
  });

  zip.file("report.html", buildHtml(input, evidenceFilenames));
  zip.file(
    "metadata.json",
    JSON.stringify(buildMetadata(input, evidenceFilenames), null, 2),
  );

  return zip.generateAsync({ type: "blob" });
}

export async function downloadReport(blob: Blob, filename: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({ url, filename, saveAs: true });
  } finally {
    // De download-API kopieert de data; de object-URL kan direct weer vrij.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
