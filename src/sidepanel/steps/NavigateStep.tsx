import type { QualificationScript, Session } from "../../shared/types";

interface NavigateStepProps {
  session: Session;
  script: QualificationScript;
  busy: boolean;
  onClearSession: () => void;
  onCapture: () => void;
  onShowOverview: () => void;
}

export function NavigateStep({
  session,
  script,
  busy,
  onClearSession,
  onCapture,
  onShowOverview,
}: NavigateStepProps) {
  return (
    <div>
      <p>
        {script.dataserviceName} v{script.version} — T-datum: {session.tDate}{" "}
        <button
          onClick={onClearSession}
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
      <button disabled={busy} onClick={onCapture}>
        Hier is bewijs
      </button>
      <button disabled={busy} onClick={onShowOverview}>
        Naar overzicht
      </button>
    </div>
  );
}
