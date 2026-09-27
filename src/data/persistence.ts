/**
 * Local persistence.
 *
 * Until Firestore is provisioned this keeps the whole store in localStorage, so
 * work survives a reload, a closed tab and a restarted laptop. It is not a
 * substitute for a server — data lives on one device and one browser profile —
 * but it removes the single most annoying thing about the app.
 *
 * Every accessor is wrapped: a private window, cleared site data or a full quota
 * all throw, and none of them should take the app down. If persistence fails the
 * app simply runs in memory, exactly as it did before.
 */

import type { Db } from "./store";

const KEY = "kurchi.db";
const VERSION_KEY = "kurchi.db.version";

/**
 * Bump this whenever the shape of Db changes in a way old saved data cannot
 * satisfy. A mismatch discards the save and falls back to seed rather than
 * hydrating a half-broken object.
 */
export const SCHEMA_VERSION = 5;

export interface PersistenceStatus {
  available: boolean;
  hydrated: boolean;
  lastSavedAt: string | null;
  reason?: string;
}

export const status: PersistenceStatus = {
  available: false,
  hydrated: false,
  lastSavedAt: null,
};

function storage(): Storage | null {
  try {
    const s = window.localStorage;
    const probe = "__kurchi_probe__";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ load */

export function load(): Partial<Db> | null {
  const s = storage();
  if (!s) {
    status.reason = "Browser storage is unavailable — running in memory.";
    return null;
  }
  status.available = true;

  try {
    const version = Number(s.getItem(VERSION_KEY));
    if (version !== SCHEMA_VERSION) {
      if (s.getItem(KEY)) {
        // Old save from a previous shape — drop it rather than hydrate garbage.
        s.removeItem(KEY);
        status.reason = "Saved data was from an older version and has been reset.";
      }
      return null;
    }

    const raw = s.getItem(KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<Db>;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.projects)) {
      s.removeItem(KEY);
      status.reason = "Saved data was unreadable and has been reset.";
      return null;
    }

    status.hydrated = true;
    return parsed;
  } catch (err) {
    status.reason = err instanceof Error ? err.message : "Could not read saved data.";
    return null;
  }
}

/* ------------------------------------------------------------------ save */

let timer: ReturnType<typeof setTimeout> | null = null;
let pending: Db | null = null;

/** Debounced — a bulk status move writes once, not once per item. */
export function save(db: Db) {
  const s = storage();
  if (!s) return;
  status.available = true;
  pending = db;

  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    if (!pending) return;
    try {
      s.setItem(KEY, JSON.stringify(pending));
      s.setItem(VERSION_KEY, String(SCHEMA_VERSION));
      status.lastSavedAt = new Date().toISOString();
      status.reason = undefined;
    } catch (err) {
      // Quota is the realistic failure here. Say so rather than dying silently.
      status.reason =
        err instanceof Error && /quota/i.test(err.message)
          ? "Browser storage is full — changes are held in memory only."
          : "Could not save to this browser.";
    } finally {
      pending = null;
    }
  }, 400);
}

/** Write immediately — used before a deliberate reload or reset. */
export function flush(db: Db) {
  const s = storage();
  if (!s) return;
  if (timer) { clearTimeout(timer); timer = null; }
  try {
    s.setItem(KEY, JSON.stringify(db));
    s.setItem(VERSION_KEY, String(SCHEMA_VERSION));
    status.lastSavedAt = new Date().toISOString();
  } catch {
    /* non-fatal */
  }
}

export function clear() {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(KEY);
    s.removeItem(VERSION_KEY);
    status.hydrated = false;
    status.lastSavedAt = null;
  } catch {
    /* non-fatal */
  }
}

/**
 * Another tab changed the data. Admin on a laptop and the same Admin on a phone
 * are different devices, but two tabs on one laptop are common enough to be
 * worth keeping in step.
 */
export function onExternalChange(cb: () => void): () => void {
  function handler(e: StorageEvent) {
    if (e.key === KEY && e.newValue) cb();
  }
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}
