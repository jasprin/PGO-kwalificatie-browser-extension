import type { QualificationScript } from "../../shared/types";
import type { OverviewRow } from "../sessionController";
import { MUTED_TEXT_COLOR } from "./styles";

/** Status-indicator voor het overzicht. Bewust blauw/oranje i.p.v. groen/rood
 * (de klassieke rood-groen-kleurenblindheid maakt dat paar onbetrouwbaar), én
 * met een tekstlabel naast het symbool — kleur/symbool alleen is niet genoeg
 * contrast/onderscheid. */
function StatusBadge({ shown }: { shown: boolean }) {
  const palette = shown
    ? { background: "#dbeafe", color: "#1e3a8a" }
    : { background: "#ffedd5", color: "#9a3412" };
  return (
    <span
      style={{
        ...palette,
        display: "inline-block",
        fontWeight: "bold",
        fontSize: "12px",
        padding: "0.1rem 0.45rem",
        borderRadius: "4px",
      }}
    >
      {shown ? "✓ Aangetoond" : "✗ Ontbrekend"}
    </span>
  );
}

interface OverviewStepProps {
  script: QualificationScript;
  overview: OverviewRow[];
  busy: boolean;
  onAnnotationChange: (row: OverviewRow, text: string) => void;
  onBack: () => void;
  onGenerateReport: () => void;
}

export function OverviewStep({
  script,
  overview,
  busy,
  onAnnotationChange,
  onBack,
  onGenerateReport,
}: OverviewStepProps) {
  return (
    <div>
      {script.scenarios.map((scenario) => (
        <div key={scenario.id}>
          {/* Sticky (issue #29): bij lange lijsten (tot 56 items in één
              scenario) verdween de scenario-context anders al na een
              paar regels scrollen uit beeld. */}
          <h2
            style={{
              fontSize: "14px",
              position: "sticky",
              top: 0,
              background: "white",
              padding: "0.2rem 0",
              margin: 0,
            }}
          >
            Scenario {scenario.number}: {scenario.title}
          </h2>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {overview
              .filter((row) => row.scenario.id === scenario.id)
              .map((row) => (
                <li key={row.item.id} style={{ marginBottom: "0.5rem" }}>
                  {/* Blok-elementen i.p.v. inline (issue #31): anders
                      liep het toelichting-veld afhankelijk van de
                      labellengte soms wel, soms niet door naar een
                      nieuwe regel. */}
                  <div>
                    <StatusBadge shown={row.shown} /> {row.item.label}
                    {row.item.bundleLabel && (
                      <span style={{ color: MUTED_TEXT_COLOR }}> ({row.item.bundleLabel})</span>
                    )}
                  </div>
                  {!row.shown && (
                    <div>
                      <input
                        style={{ width: "100%" }}
                        placeholder="Toelichting (optioneel)"
                        value={row.annotation ?? ""}
                        onChange={(e) =>
                          onAnnotationChange(row, (e.target as HTMLInputElement).value)
                        }
                      />
                    </div>
                  )}
                </li>
              ))}
          </ul>
        </div>
      ))}
      <button disabled={busy} onClick={onBack}>
        Terug naar navigeren (nog iets vastleggen)
      </button>
      <button disabled={busy} onClick={onGenerateReport}>
        Rapport genereren
      </button>
    </div>
  );
}
