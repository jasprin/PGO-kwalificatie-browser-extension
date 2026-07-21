// Achtergrond service worker (PLAN.md §8.2): bewust dun, alleen routering.
// Geen sessie-state hier — die leeft uitsluitend in de side panel. Twee
// triggers voor "hier is bewijs" worden ondersteund (§7.1/§8.2): een
// globale hotkey (hier afgehandeld) en een knop in de side panel zelf
// (rechtstreeks, zonder omweg via de worker).

import type { CaptureEvidenceCommand } from "../shared/messages";

// Issue #14 (klik op het werkbalk-icoon opende het side panel niet
// betrouwbaar): zowel de handmatige chrome.action.onClicked +
// chrome.sidePanel.open()-aanpak als het nátieve
// setPanelBehavior({openPanelOnActionClick: true})-mechanisme bleken
// onbetrouwbaar — niet alleen in Brave maar ook in Edge. We laten de
// klik-op-icoon-flow daarom over aan het paneel-icoon van de browser zelf
// (zie README "Gebruiken"); hier resteert alleen het openen via de hotkey.
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
