// Achtergrond service worker (PLAN.md §8.2): bewust dun, alleen routering.
// Geen sessie-state hier — die leeft uitsluitend in de side panel. Twee
// triggers voor "hier is bewijs" worden ondersteund (§7.1/§8.2): een
// globale hotkey (hier afgehandeld) en een knop in de side panel zelf
// (rechtstreeks, zonder omweg via de worker).

import type { CaptureEvidenceCommand } from "../shared/messages";

// Expliciet afgehandeld i.p.v. via chrome.sidePanel.setPanelBehavior() in
// onInstalled: die instelling wordt maar één keer gezet en bleek onbetrouwbaar
// bij herhaald herladen van de (unpacked) extensie tijdens ontwikkeling. Een
// directe onClicked-listener werkt altijd, ongeacht wanneer/hoe vaak de
// extensie opnieuw geladen is.
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
