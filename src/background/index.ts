// Achtergrond service worker (PLAN.md §8.2): bewust dun, alleen routering.
// Geen sessie-state hier — die leeft uitsluitend in de side panel. Twee
// triggers voor "hier is bewijs" worden ondersteund (§7.1/§8.2): een
// globale hotkey (hier afgehandeld) en een knop in de side panel zelf
// (rechtstreeks, zonder omweg via de worker).

import type { CaptureEvidenceCommand } from "../shared/messages";

// Issue #14 (klik op het werkbalk-icoon opende het side panel niet
// betrouwbaar): de eerdere aanpak deed dit handmatig via
// chrome.action.onClicked + chrome.sidePanel.open(), wat gevoelig bleek voor
// timing-problemen — als de service worker net wakker gemaakt moest worden
// door de klik, kon de user-gesture-context verlopen zijn tegen de tijd dat
// open() daadwerkelijk werd aangeroepen. Chrome heeft hier een nátief
// mechanisme voor dat deze race niet kent: openPanelOnActionClick laat de
// browser zelf het paneel openen bij een klik, vóór er JS aan te pas komt.
// chrome.sidePanel.open-on-click en chrome.action.onClicked zijn wederzijds
// exclusief (bij true vuurt onClicked niet meer) — vandaar geen aparte
// onClicked-listener meer hieronder.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error("Kon side panel-gedrag niet instellen:", error));

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
