// Achtergrond service worker (PLAN.md §8.2): bewust dun, alleen routering.
// Geen sessie-state hier — die leeft uitsluitend in de side panel. Twee
// triggers voor "hier is bewijs" worden ondersteund (§7.1/§8.2): een
// globale hotkey (hier afgehandeld) en een knop in de side panel zelf
// (rechtstreeks, zonder omweg via de worker).

import type { CaptureEvidenceCommand } from "../shared/messages";

// Belangrijk: chrome.sidePanel.open-on-click en chrome.action.onClicked zijn
// wederzijds exclusief — als openPanelOnActionClick ooit op true is gezet
// (bv. door een eerdere versie van deze code), blijft die vlag hangen in het
// browserprofiel, ook nadat de aanroep uit de code is gehaald, en onderdrukt
// die dan alsnog onClicked. Daarom hier expliciet terugzetten naar false vóór
// de onClicked-listener wordt geregistreerd.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: false })
  .catch((error) => console.error("Kon side panel-gedrag niet resetten:", error));

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.windowId !== undefined) {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "capture-evidence") return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.windowId !== undefined) {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  }

  const message: CaptureEvidenceCommand = { type: "capture-evidence" };
  // De side panel luistert hierop om dezelfde capture-en-detectiestap te
  // starten als bij een klik op de knop (§7.1/§8.2).
  chrome.runtime.sendMessage(message).catch(() => {
    // Side panel nog niet geladen/luisterend — negeren, gebruiker kan
    // alsnog op de knop klikken.
  });
});
