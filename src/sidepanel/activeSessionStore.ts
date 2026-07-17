// Onthoudt de lopende sessie voor de duur van de browsersessie
// (chrome.storage.session: leeft in het geheugen, automatisch leeg bij het
// herstarten van de browser — dus geen extra "sessie opruimen"-actie nodig).
// Los van de langdurige IndexedDB-opslag (§7.1): dit is puur UI-gemak zodat
// het side panel niet leeg is na sluiten/heropenen, geen vervanging voor de
// daadwerkelijke evidence/toelichtingen-opslag.

import type { QualificationScript, Session } from "../shared/types";

const STORAGE_KEY = "active-session";

interface ActiveSessionState {
  session: Session;
  script: QualificationScript;
}

export async function saveActiveSession(
  session: Session,
  script: QualificationScript,
): Promise<void> {
  await chrome.storage.session.set({
    [STORAGE_KEY]: { session, script } satisfies ActiveSessionState,
  });
}

export async function loadActiveSession(): Promise<ActiveSessionState | undefined> {
  const result = await chrome.storage.session.get(STORAGE_KEY);
  return result[STORAGE_KEY] as ActiveSessionState | undefined;
}

export async function clearActiveSession(): Promise<void> {
  await chrome.storage.session.remove(STORAGE_KEY);
}
