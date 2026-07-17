// Berichtformaten voor chrome.runtime-messaging tussen background,
// content script en side panel (PLAN.md §8.2).

import type { ChecklistItem, DomMatchResult } from "./types";

export interface FindMatchesRequest {
  type: "find-matches";
  items: ChecklistItem[];
  tDate: string;
}

export interface FindMatchesResponse {
  type: "find-matches-result";
  matches: DomMatchResult[];
  devicePixelRatio: number;
  viewport: { width: number; height: number };
}

/** Getriggerd door hotkey (chrome.commands) of knop in de side panel (§7.1/§8.2). */
export interface CaptureEvidenceCommand {
  type: "capture-evidence";
}
