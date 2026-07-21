// Content script entrypoint (PLAN.md §8.2): statisch geregistreerd in
// manifest.config.ts (content_scripts, matches <all_urls>, run_at
// document_idle) — draait dus op elke pagina bij het laden, niet pas na een
// "hier is bewijs"-trigger. Doet tot die trigger niets anders dan deze
// listener registreren; de find-matches-boodschap is alleen bereikbaar via
// chrome.runtime.sendMessage vanuit de extensie zelf (side panel), niet
// vanaf de pagina zelf. Levert alleen DOM-feiten terug: gevonden matches +
// coördinaten. Maakt zelf geen screenshot en doet geen AI-aanroep (dat hoort
// bij de side panel, §8.2).

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
