import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { AnnotationRecord, Evidence, Session } from "../shared/types";

const DB_NAME = "pgo-kwalificatie-poc";
const DB_VERSION = 1;

/** Samengestelde sleutel voor annotaties, zie PLAN.md §7.1 ("Identificatie"). */
export function annotationKey(
  qualificationScriptUrl: string,
  scenarioId: string,
  checklistItemId: string,
): string {
  return `${qualificationScriptUrl}::${scenarioId}::${checklistItemId}`;
}

/** Opslagvorm van een annotatie: de samengestelde sleutel zit als veld in de
 * record zelf, zodat `keyPath: "key"` kan werken (idb vereist dat het keyPath
 * daadwerkelijk op de opgeslagen waarde voorkomt). */
export type StoredAnnotation = AnnotationRecord & { key: string };

interface AppDB extends DBSchema {
  annotations: {
    key: string;
    value: StoredAnnotation;
    indexes: { byScript: string };
  };
  sessions: {
    key: string;
    value: Session;
  };
  evidence: {
    key: string;
    value: Evidence;
    indexes: { bySession: string };
  };
  images: {
    key: string;
    value: Blob;
  };
  settings: {
    key: string;
    value: unknown;
  };
}

let dbPromise: Promise<IDBPDatabase<AppDB>> | undefined;

export function getDb(): Promise<IDBPDatabase<AppDB>> {
  if (!dbPromise) {
    dbPromise = openDB<AppDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const annotations = db.createObjectStore("annotations", {
          keyPath: "key",
        });
        annotations.createIndex("byScript", "qualificationScriptUrl");

        db.createObjectStore("sessions", { keyPath: "id" });

        const evidence = db.createObjectStore("evidence", { keyPath: "id" });
        evidence.createIndex("bySession", "sessionId");

        db.createObjectStore("images");
        db.createObjectStore("settings");
      },
    });
  }
  return dbPromise;
}
