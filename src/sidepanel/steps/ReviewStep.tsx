import type { Scenario } from "../../shared/types";
import type { CaptureDraft, ProposedElement } from "../sessionController";
import { MUTED_TEXT_COLOR } from "./styles";

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

interface ReviewStepProps {
  draft: CaptureDraft;
  scenarios: Scenario[];
  reviewScenarioId: string;
  onScenarioChange: (scenarioId: string) => void;
  reviewElements: ProposedElement[];
  onToggleElement: (checklistItemId: string) => void;
  busy: boolean;
  onConfirm: () => void;
}

export function ReviewStep({
  draft,
  scenarios,
  reviewScenarioId,
  onScenarioChange,
  reviewElements,
  onToggleElement,
  busy,
  onConfirm,
}: ReviewStepProps) {
  return (
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
          onInput={(e) => onScenarioChange((e.target as HTMLSelectElement).value)}
        >
          {scenarios.map((s) => (
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
                onChange={() => onToggleElement(el.checklistItemId)}
              />
              {el.label}
              {el.bundleLabel && (
                <span style={{ color: MUTED_TEXT_COLOR }}> ({el.bundleLabel})</span>
              )}{" "}
              <em style={{ color: MUTED_TEXT_COLOR }}>
                (
                {el.source === "manual"
                  ? sourceLabel(el.source)
                  : `${sourceLabel(el.source)}, ${(el.confidence * 100).toFixed(0)}%`}
                )
              </em>
              {el.explanation && <div style={{ color: MUTED_TEXT_COLOR }}>{el.explanation}</div>}
              {el.visualEvidence && (
                <div style={{ color: MUTED_TEXT_COLOR, fontStyle: "italic" }}>
                  Citaat AI: “{el.visualEvidence}”
                </div>
              )}
            </label>
          </li>
        ))}
      </ul>
      <button disabled={busy} onClick={onConfirm}>
        Bevestig en sla op
      </button>
    </div>
  );
}
