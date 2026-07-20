import { useEffect, useState } from "preact/hooks";
import { computeDefaultTDate } from "../shared/tDate";
import type { CaptureEvidenceCommand } from "../shared/messages";
import type { QualificationScript, Scenario, Session } from "../shared/types";
import { clearActiveSession, loadActiveSession, saveActiveSession } from "./activeSessionStore";
import {
  buildAndDownloadReport,
  buildReviewElements,
  captureAndSuggest,
  confirmEvidence,
  getOverview,
  saveAnnotation,
  startSession,
  type CaptureDraft,
  type OverviewRow,
  type ProposedElement,
} from "./sessionController";

type Step = "start" | "navigate" | "review" | "overview" | "report-done";

/** Status-indicator voor het overzicht. Bewust blauw/oranje i.p.v. groen/rood
 * (de klassieke rood-groen-kleurenblindheid maakt dat paar onbetrouwbaar), én
 * met een tekstlabel naast het symbool — kleur/symbool alleen is niet genoeg
 * contrast/onderscheid. */
/** "manual" betekent hier: niet gecontroleerd door DOM- of AI-matching (bv.
 * omdat de AI-call is overgeslagen, issue #16) — nadrukkelijk anders dan
 * "ai" met 0%, wat zou lezen als "de AI heeft gekeken en niets gevonden". */
function sourceLabel(source: ProposedElement["source"]): string {
  switch (source) {
    case "dom":
      return "DOM";
    case "ai":
      return "AI";
    case "manual":
      return "niet gecontroleerd";
  }
}

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

export function App() {
  const [step, setStep] = useState<Step>("start");
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const [scriptUrl, setScriptUrl] = useState("");
  const [tDate, setTDate] = useState(computeDefaultTDate());

  const [session, setSession] = useState<Session | undefined>(undefined);
  const [script, setScript] = useState<QualificationScript | undefined>(undefined);

  const [draft, setDraft] = useState<CaptureDraft | undefined>(undefined);
  const [reviewElements, setReviewElements] = useState<ProposedElement[]>([]);
  const [reviewScenarioId, setReviewScenarioId] = useState<string>("");

  const [overview, setOverview] = useState<OverviewRow[]>([]);

  // Herstelt een lopende sessie na het sluiten/heropenen van de side panel
  // (§7.1/UX: de gebruiker hoeft de kwalificatiescript-URL niet opnieuw in te
  // voeren binnen dezelfde browsersessie). Draaien we nog niet, dan blijft
  // de gebruiker gewoon op het start-scherm.
  useEffect(() => {
    loadActiveSession().then((active) => {
      if (!active) return;
      setSession(active.session);
      setScript(active.script);
      setScriptUrl(active.session.qualificationScriptUrl);
      setTDate(active.session.tDate);
      setStep("navigate");
    });
  }, []);

  async function handleStart() {
    setBusy(true);
    setError(undefined);
    try {
      const result = await startSession(scriptUrl, tDate);
      setSession(result.session);
      setScript(result.script);
      await saveActiveSession(result.session, result.script);
      setStep("navigate");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleCapture() {
    if (!script || !session) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await captureAndSuggest(script, session.tDate);
      setDraft(result);
      setReviewElements(result.elements);
      setReviewScenarioId(result.scenarioGuess?.id ?? "");
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // Luistert op het hotkey-signaal vanuit de service worker (§7.1/§8.2: twee
  // triggers voor "hier is bewijs" — hotkey en knop leiden naar dezelfde stap).
  useEffect(() => {
    function onMessage(message: CaptureEvidenceCommand) {
      if (message.type === "capture-evidence" && step === "navigate") {
        handleCapture();
      }
    }
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, [step, script, session]);

  // Fix voor een bug gevonden tijdens live-testen: het wisselen van scenario
  // in de review-stap veranderde alleen de dropdown, niet de getoonde
  // verwachte waarden — de leverancier kon dus niet betrouwbaar corrigeren
  // als de automatische scenario-gok fout was. domMatches/aiSuggestion dekken
  // altijd alle scenario's (zie captureAndSuggest), dus we kunnen hier zonder
  // nieuwe capture herprojecteren op het net gekozen scenario.
  function handleScenarioChange(newScenarioId: string) {
    setReviewScenarioId(newScenarioId);
    if (!script || !draft) return;
    const scenario = script.scenarios.find((s) => s.id === newScenarioId);
    if (!scenario) return;
    setReviewElements(buildReviewElements(scenario, draft.domMatches, draft.aiSuggestion));
  }

  // Wist de onthouden sessie (§7.1-UX) — bv. om per ongeluk de verkeerde
  // kwalificatiescript-URL kwijt te raken zonder de browser te herstarten.
  // Alleen de chrome.storage.session-snapshot en de UI-state, niet de al
  // vastgelegde bewijsstukken/toelichtingen in IndexedDB.
  async function handleClearSession() {
    // Issue #30: een los rood kruisje oogde als foutindicator en kon zonder
    // bevestiging per ongeluk aangeklikt worden — nu een expliciete vraag,
    // want de kwalificatiescript-URL/T-datum moeten anders opnieuw ingevoerd
    // worden (het al vastgelegde bewijs in IndexedDB blijft hoe dan ook intact).
    if (!window.confirm("Sessie wissen? Je moet de kwalificatiescript-URL opnieuw invoeren.")) {
      return;
    }
    await clearActiveSession();
    setSession(undefined);
    setScript(undefined);
    setScriptUrl("");
    setTDate(computeDefaultTDate());
    setDraft(undefined);
    setReviewElements([]);
    setReviewScenarioId("");
    setOverview([]);
    setStep("start");
  }

  function toggleElement(checklistItemId: string) {
    setReviewElements((prev) =>
      prev.map((el) =>
        el.checklistItemId === checklistItemId ? { ...el, visible: !el.visible } : el,
      ),
    );
  }

  async function handleConfirmEvidence() {
    if (!session || !script || !draft) return;
    setBusy(true);
    setError(undefined);
    try {
      await confirmEvidence(session, draft, reviewElements);
      // Issue #15: confirmEvidence() zet bij de EERSTE capture session.markerColor
      // (muteert hetzelfde object, geen nieuwe sessie). Zonder dit hier opnieuw
      // op te slaan bleef de chrome.storage.session-snapshot op de oude/lege
      // kleur staan: sluit je het side panel daarna en open je het opnieuw, dan
      // koos confirmEvidence() bij de volgende capture een NIEUWE kleur — met
      // afwijkende kaderkleuren tussen bewijsstukken in hetzelfde rapport tot
      // gevolg.
      await saveActiveSession(session, script);
      setDraft(undefined);
      setStep("navigate");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleShowOverview() {
    if (!session || !script) return;
    setBusy(true);
    setError(undefined);
    try {
      const rows = await getOverview(session, script);
      setOverview(rows);
      setStep("overview");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleAnnotationChange(row: OverviewRow, text: string) {
    if (!session) return;
    await saveAnnotation(session, row.scenario.id, row.item.id, text);
  }

  async function handleGenerateReport() {
    if (!session || !script) return;
    setBusy(true);
    setError(undefined);
    try {
      await buildAndDownloadReport(session, script);
      setStep("report-done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "0.75rem", fontSize: "13px" }}>
      <h1 style={{ fontSize: "15px" }}>PGO kwalificatie extension</h1>
      {error && <p style={{ color: "#b00020" }}>Fout: {error}</p>}

      {step === "start" && (
        <div>
          <label>
            Kwalificatiescript-URL
            <input
              style={{ width: "100%" }}
              value={scriptUrl}
              onInput={(e) => setScriptUrl((e.target as HTMLInputElement).value)}
              placeholder="https://informatiestandaarden.nictiz.nl/wiki/..."
            />
          </label>
          <label>
            T-datum (voorstel: maandag van deze week — corrigeer indien nodig)
            <input
              type="date"
              value={tDate}
              onInput={(e) => setTDate((e.target as HTMLInputElement).value)}
            />
          </label>
          <button disabled={busy || !scriptUrl} onClick={handleStart}>
            Sessie starten
          </button>
        </div>
      )}

      {step === "navigate" && session && script && (
        <div>
          <p>
            {script.dataserviceName} v{script.version} — T-datum: {session.tDate}{" "}
            <button
              onClick={handleClearSession}
              title="Sessie wissen (URL opnieuw invoeren)"
              style={{
                border: "none",
                background: "none",
                color: "#b00020",
                cursor: "pointer",
                fontWeight: "bold",
                fontSize: "12px",
              }}
            >
              ✕ Sessie wissen
            </button>
          </p>
          <p>Navigeer naar de gewenste pagina in de PGO en klik dan hieronder.</p>
          <button disabled={busy} onClick={handleCapture}>
            Hier is bewijs
          </button>
          <button disabled={busy} onClick={handleShowOverview}>
            Naar overzicht
          </button>
        </div>
      )}

      {step === "review" && draft && (
        <div>
          {draft.aiWarning && (
            <p style={{ color: "#9a3412", background: "#ffedd5", padding: "0.4rem", borderRadius: "4px" }}>
              ⚠ {draft.aiWarning}
            </p>
          )}
          <label>
            Scenario
            <select
              value={reviewScenarioId}
              onInput={(e) => handleScenarioChange((e.target as HTMLSelectElement).value)}
            >
              {script?.scenarios.map((s: Scenario) => (
                <option value={s.id} key={s.id}>
                  {s.number}: {s.title}
                </option>
              ))}
            </select>
          </label>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {reviewElements.map((el) => (
              <li key={el.checklistItemId}>
                <label>
                  <input
                    type="checkbox"
                    checked={el.visible}
                    onChange={() => toggleElement(el.checklistItemId)}
                  />
                  {el.label}
                  {el.bundleLabel && (
                    <span style={{ color: "#666" }}> ({el.bundleLabel})</span>
                  )}{" "}
                  <em style={{ color: "#666" }}>
                    (
                    {el.source === "manual"
                      ? sourceLabel(el.source)
                      : `${sourceLabel(el.source)}, ${(el.confidence * 100).toFixed(0)}%`}
                    )
                  </em>
                  {el.explanation && <div style={{ color: "#666" }}>{el.explanation}</div>}
                  {el.visualEvidence && (
                    <div style={{ color: "#666", fontStyle: "italic" }}>
                      Citaat AI: “{el.visualEvidence}”
                    </div>
                  )}
                </label>
              </li>
            ))}
          </ul>
          <button disabled={busy} onClick={handleConfirmEvidence}>
            Bevestig en sla op
          </button>
        </div>
      )}

      {step === "overview" && (
        <div>
          {script?.scenarios.map((scenario) => (
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
                          <span style={{ color: "#666" }}> ({row.item.bundleLabel})</span>
                        )}
                      </div>
                      {!row.shown && (
                        <div>
                          <input
                            style={{ width: "100%" }}
                            placeholder="Toelichting (optioneel)"
                            value={row.annotation ?? ""}
                            onChange={(e) =>
                              handleAnnotationChange(row, (e.target as HTMLInputElement).value)
                            }
                          />
                        </div>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
          <button disabled={busy} onClick={() => setStep("navigate")}>
            Terug naar navigeren (nog iets vastleggen)
          </button>
          <button disabled={busy} onClick={handleGenerateReport}>
            Rapport genereren
          </button>
        </div>
      )}

      {step === "report-done" && (
        <div>
          <p>Rapport gedownload. Controleer het en verstuur het zelf naar het kwalificatiecentrum.</p>
          <button onClick={() => setStep("navigate")}>Terug naar sessie</button>
        </div>
      )}
    </div>
  );
}
