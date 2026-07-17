// Repository-patroon (PLAN.md §8.6): de rest van de extensie praat alléén
// tegen deze interfaces, nooit rechtstreeks tegen IndexedDB. Dat maakt het
// later mogelijk om een implementatie te vervangen door gedeelde/centrale
// opslag (§4.2) zonder de rest van de extensie te herbouwen.

import { annotationKey, getDb, type StoredAnnotation } from "./db";
import type {
  AnnotationKey,
  AnnotationRecord,
  Evidence,
  Session,
} from "../shared/types";

export interface AnnotationRepository {
  getForDataservice(qualificationScriptUrl: string): Promise<AnnotationRecord[]>;
  get(key: AnnotationKey): Promise<AnnotationRecord | undefined>;
  upsert(key: AnnotationKey, text: string): Promise<void>;
}

export interface SessionEvidenceStore {
  createSession(session: Session): Promise<void>;
  getSession(id: string): Promise<Session | undefined>;
  addEvidence(evidence: Evidence): Promise<void>;
  updateEvidence(evidence: Evidence): Promise<void>;
  getEvidenceForSession(sessionId: string): Promise<Evidence[]>;
  saveImage(key: string, blob: Blob): Promise<void>;
  getImage(key: string): Promise<Blob | undefined>;
}

export interface SettingsRepository {
  getApiKey(): Promise<string | undefined>;
  setApiKey(key: string): Promise<void>;
}

class IndexedDbAnnotationRepository implements AnnotationRepository {
  async getForDataservice(
    qualificationScriptUrl: string,
  ): Promise<AnnotationRecord[]> {
    const db = await getDb();
    return db.getAllFromIndex(
      "annotations",
      "byScript",
      qualificationScriptUrl,
    );
  }

  async get(key: AnnotationKey): Promise<AnnotationRecord | undefined> {
    const db = await getDb();
    return db.get(
      "annotations",
      annotationKey(
        key.qualificationScriptUrl,
        key.scenarioId,
        key.checklistItemId,
      ),
    );
  }

  async upsert(key: AnnotationKey, text: string): Promise<void> {
    const db = await getDb();
    const compositeKey = annotationKey(
      key.qualificationScriptUrl,
      key.scenarioId,
      key.checklistItemId,
    );
    const record: StoredAnnotation = {
      ...key,
      text,
      updatedAt: new Date().toISOString(),
      key: compositeKey,
    };
    await db.put("annotations", record);
  }
}

class IndexedDbSessionEvidenceStore implements SessionEvidenceStore {
  async createSession(session: Session): Promise<void> {
    const db = await getDb();
    await db.put("sessions", session);
  }

  async getSession(id: string): Promise<Session | undefined> {
    const db = await getDb();
    return db.get("sessions", id);
  }

  async addEvidence(evidence: Evidence): Promise<void> {
    const db = await getDb();
    await db.put("evidence", evidence);
  }

  async updateEvidence(evidence: Evidence): Promise<void> {
    const db = await getDb();
    await db.put("evidence", evidence);
  }

  async getEvidenceForSession(sessionId: string): Promise<Evidence[]> {
    const db = await getDb();
    return db.getAllFromIndex("evidence", "bySession", sessionId);
  }

  async saveImage(key: string, blob: Blob): Promise<void> {
    const db = await getDb();
    await db.put("images", blob, key);
  }

  async getImage(key: string): Promise<Blob | undefined> {
    const db = await getDb();
    return db.get("images", key);
  }
}

const API_KEY_STORAGE_KEY = "claude-api-key";

class IndexedDbSettingsRepository implements SettingsRepository {
  async getApiKey(): Promise<string | undefined> {
    const db = await getDb();
    return (await db.get("settings", API_KEY_STORAGE_KEY)) as
      | string
      | undefined;
  }

  async setApiKey(key: string): Promise<void> {
    const db = await getDb();
    await db.put("settings", key, API_KEY_STORAGE_KEY);
  }
}

// Voor de PoC (§4.1) zijn dit de enige implementaties; een toekomstige
// gedeelde/centrale opslag (§4.2) betekent één nieuwe klasse per interface,
// zonder dat de rest van de extensie hoeft te veranderen.
export const annotationRepository: AnnotationRepository =
  new IndexedDbAnnotationRepository();
export const sessionEvidenceStore: SessionEvidenceStore =
  new IndexedDbSessionEvidenceStore();
export const settingsRepository: SettingsRepository =
  new IndexedDbSettingsRepository();
