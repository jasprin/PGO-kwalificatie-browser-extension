import { useEffect, useState } from "preact/hooks";
import { computeDefaultTDate } from "../shared/tDate";
import type { CaptureEvidenceCommand } from "../shared/messages";
import type { QualificationScript, Scenario, Session } from "../shared/types";
import { loadActiveSession, saveActiveSession } from "./activeSessionStore";
import {
  buildAndDownloadReport,
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

  function toggleElement(checklistItemId: string) {
    setReviewElements((prev) =>
      prev.map((el) =>
        el.checklistItemId === checklistItemId ? { ...el, visible: !el.visible } : el,
      ),
    );
  }

  async function handleConfirmEvidence() {
    if (!session || !draft) return;
    setBusy(true);
    setError(undefined);
    try {
      await confirmEvidence(session, draft, reviewElements);
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
            {script.dataserviceName} v{script.version} — T-datum: {session.tDate}
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
          <label>
            Scenario
            <select
              value={reviewScenarioId}
              onInput={(e) => setReviewScenarioId((e.target as HTMLSelectElement).value)}
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
                  {el.label}{" "}
                  <em style={{ color: "#666" }}>
                    ({el.source}, {(el.confidence * 100).toFixed(0)}%)
                  </em>
                  {el.explanation && <div style={{ color: "#666" }}>{el.explanation}</div>}
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
              <h2 style={{ fontSize: "14px" }}>
                Scenario {scenario.number}: {scenario.title}
              </h2>
              <ul style={{ listStyle: "none", padding: 0 }}>
                {overview
                  .filter((row) => row.scenario.id === scenario.id)
                  .map((row) => (
                    <li key={row.item.id}>
                      {row.shown ? "✓" : "✗"} {row.item.label}
                      {!row.shown && (
                        <input
                          placeholder="Toelichting (optioneel)"
                          value={row.annotation ?? ""}
                          onChange={(e) =>
                            handleAnnotationChange(row, (e.target as HTMLInputElement).value)
                          }
                        />
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
