import { useEffect, useState } from "preact/hooks";
import { computeDefaultTDate } from "../shared/tDate";
import type { CaptureEvidenceCommand } from "../shared/messages";
import type { QualificationScript, Session } from "../shared/types";
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
import { StartStep } from "./steps/StartStep";
import { NavigateStep } from "./steps/NavigateStep";
import { ReviewStep } from "./steps/ReviewStep";
import { OverviewStep } from "./steps/OverviewStep";
import { ReportDoneStep } from "./steps/ReportDoneStep";

type Step = "start" | "navigate" | "review" | "overview" | "report-done";

/** Bundelt het "setBusy(true) → probeer → setError bij fout → setBusy(false)"
 * -patroon dat voorheen in elke stap-handler apart stond (issue #36). */
function useBusyAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function run(fn: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, run };
}

export function App() {
  const [step, setStep] = useState<Step>("start");
  const { busy, error, run } = useBusyAction();

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

  function handleStart(): void {
    run(async () => {
      const result = await startSession(scriptUrl, tDate);
      setSession(result.session);
      setScript(result.script);
      await saveActiveSession(result.session, result.script);
      setStep("navigate");
    });
  }

  function handleCapture(): void {
    run(async () => {
      if (!script || !session) return;
      const result = await captureAndSuggest(script, session.tDate);
      setDraft(result);
      setReviewElements(result.elements);
      setReviewScenarioId(result.scenarioGuess?.id ?? "");
      setStep("review");
    });
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

  function handleConfirmEvidence(): void {
    run(async () => {
      if (!session || !script || !draft) return;
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
    });
  }

  function handleShowOverview(): void {
    run(async () => {
      if (!session || !script) return;
      const rows = await getOverview(session, script);
      setOverview(rows);
      setStep("overview");
    });
  }

  async function handleAnnotationChange(row: OverviewRow, text: string) {
    if (!session) return;
    await saveAnnotation(session, row.scenario.id, row.item.id, text);
  }

  function handleGenerateReport(): void {
    run(async () => {
      if (!session || !script) return;
      await buildAndDownloadReport(session, script);
      setStep("report-done");
    });
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "0.75rem", fontSize: "13px" }}>
      <h1 style={{ fontSize: "15px" }}>PGO kwalificatie extension</h1>
      {error && <p style={{ color: "#b00020" }}>Fout: {error}</p>}

      {step === "start" && (
        <StartStep
          scriptUrl={scriptUrl}
          onScriptUrlChange={setScriptUrl}
          tDate={tDate}
          onTDateChange={setTDate}
          busy={busy}
          onStart={handleStart}
        />
      )}

      {step === "navigate" && session && script && (
        <NavigateStep
          session={session}
          script={script}
          busy={busy}
          onClearSession={handleClearSession}
          onCapture={handleCapture}
          onShowOverview={handleShowOverview}
        />
      )}

      {step === "review" && draft && script && (
        <ReviewStep
          draft={draft}
          scenarios={script.scenarios}
          reviewScenarioId={reviewScenarioId}
          onScenarioChange={handleScenarioChange}
          reviewElements={reviewElements}
          onToggleElement={toggleElement}
          busy={busy}
          onConfirm={handleConfirmEvidence}
        />
      )}

      {step === "overview" && script && (
        <OverviewStep
          script={script}
          overview={overview}
          busy={busy}
          onAnnotationChange={handleAnnotationChange}
          onBack={() => setStep("navigate")}
          onGenerateReport={handleGenerateReport}
        />
      )}

      {step === "report-done" && <ReportDoneStep onBack={() => setStep("navigate")} />}
    </div>
  );
}
