// Content script entrypoint (PLAN.md §8.2): wordt on-demand geïnjecteerd op
// de actieve tab (activeTab + scripting, geen statische content_scripts-match
// — zie manifest.config.ts) wanneer de leverancier "hier is bewijs" triggert.
// Levert alleen DOM-feiten terug: gevonden matches + coördinaten. Maakt zelf
// geen screenshot en doet geen AI-aanroep (dat hoort bij de side panel, §8.2).

import type { FindMatchesRequest, FindMatchesResponse } from "../shared/messages";
import { findMatchesForChecklist } from "./domMatcher";

chrome.runtime.onMessage.addListener((message: FindMatchesRequest, _sender, sendResponse) => {
  if (message.type !== "find-matches") return undefined;

  const results = findMatchesForChecklist(
    document.body,
    message.items,
    message.tDate,
    window.devicePixelRatio || 1,
  );

  const response: FindMatchesResponse = {
    type: "find-matches-result",
    matches: results,
    devicePixelRatio: window.devicePixelRatio || 1,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
  };
  sendResponse(response);
  return true;
});
