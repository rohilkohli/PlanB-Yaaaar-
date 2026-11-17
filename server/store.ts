/**
 * Small TTL document store used for share links, push reminders and recaps.
 * Firestore (REST, native to Google Cloud, shared across Cloud Run instances) when available, else in-memory
 * (local dev and tests). Every document carries `expireAt` (Firestore TTL policy deletes it) and optionally `dueAt`
 * (epoch ms) so a scheduler can ask "what is due now?" with a single-field range query (no composite index).
 */
import { accessToken, gcpAvailable, gcpProject } from './gcp';

export interface StoredDoc<T = unknown> { id: string; data: T; dueAt?: number; expireAt: number }

const mem = new Map<string, Map<string, StoredDoc>>();
export function resetStore() { mem.clear(); }

const safeId = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120);
const base = (project: string) => `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;

function bucket(coll: string) {
  let b = mem.get(coll);
  if (!b) { b = new Map(); mem.set(coll, b); }
  return b;
}
function sweep(b: Map<string, StoredDoc>) {
  const now = Date.now();
  if (b.size > 2000) for (const [k, v] of b) if (v.expireAt < now) b.delete(k);
}

async function fs(project: string, method: string, path: string, body?: unknown): Promise<Response | null> {
  const token = await accessToken();
  if (!token) return null;
  try {
    return await fetch(`${base(project)}${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(2500)
    });
  } catch { return null; }
}

const toFields = (d: StoredDoc) => ({
  json: { stringValue: JSON.stringify(d.data) },
  expireAt: { timestampValue: new Date(d.expireAt).toISOString() },
  ...(d.dueAt !== undefined ? { dueAt: { integerValue: String(d.dueAt) } } : {})
});
function fromFields(id: string, f: Record<string, any> | undefined): StoredDoc | null {
  if (!f?.json?.stringValue) return null;
  try {
    return {
      id, data: JSON.parse(f.json.stringValue),
      expireAt: f.expireAt?.timestampValue ? Date.parse(f.expireAt.timestampValue) : 0,
      dueAt: f.dueAt?.integerValue !== undefined ? Number(f.dueAt.integerValue) : undefined
    };
  } catch { return null; }
}

export async function putDoc<T>(coll: string, id: string, data: T, ttlSec: number, dueAt?: number): Promise<boolean> {
  const doc: StoredDoc<T> = { id: safeId(id), data, dueAt, expireAt: Date.now() + ttlSec * 1000 };
  const project = gcpProject();
  if (project && gcpAvailable()) {
    const r = await fs(project, 'PATCH', `/${coll}/${doc.id}`, { fields: toFields(doc) });
    if (r?.ok) return true;
    if (process.env.K_SERVICE) return false; // on Cloud Run a silent memory fallback would hide data on other instances
  }
  const b = bucket(coll); b.set(doc.id, doc); sweep(b);
  return true;
}

export async function getDoc<T>(coll: string, id: string): Promise<T | null> {
  const key = safeId(id);
  const project = gcpProject();
  if (project && gcpAvailable()) {
    const r = await fs(project, 'GET', `/${coll}/${key}`);
    if (r?.ok) {
      const d = fromFields(key, ((await r.json()) as { fields?: Record<string, any> }).fields);
      return d && d.expireAt > Date.now() ? (d.data as T) : null;
    }
    if (r?.status === 404) return null;
    if (process.env.K_SERVICE) return null;
  }
  const d = mem.get(coll)?.get(key);
  return d && d.expireAt > Date.now() ? (d.data as T) : null;
}

export async function deleteDoc(coll: string, id: string): Promise<void> {
  const key = safeId(id);
  const project = gcpProject();
  if (project && gcpAvailable()) { await fs(project, 'DELETE', `/${coll}/${key}`); if (process.env.K_SERVICE) return; }
  mem.get(coll)?.delete(key);
}

/** Documents whose `dueAt` is <= `beforeMs`, oldest first. */
export async function listDue<T>(coll: string, beforeMs: number, limit = 100): Promise<Array<{ id: string; data: T; dueAt: number }>> {
  const project = gcpProject();
  if (project && gcpAvailable()) {
    const r = await fs(project, 'POST', ':runQuery', { structuredQuery: {
      from: [{ collectionId: coll }],
      where: { fieldFilter: { field: { fieldPath: 'dueAt' }, op: 'LESS_THAN_OR_EQUAL', value: { integerValue: String(beforeMs) } } },
      orderBy: [{ field: { fieldPath: 'dueAt' }, direction: 'ASCENDING' }], limit
    } });
    if (r?.ok) {
      const rows = (await r.json()) as Array<{ document?: { name: string; fields?: Record<string, any> } }>;
      return rows.flatMap(row => {
        if (!row.document) return [];
        const id = row.document.name.split('/').pop() as string;
        const d = fromFields(id, row.document.fields);
        return d && d.dueAt !== undefined && d.expireAt > Date.now() ? [{ id, data: d.data as T, dueAt: d.dueAt }] : [];
      });
    }
    if (process.env.K_SERVICE) return [];
  }
  return [...(mem.get(coll)?.values() ?? [])]
    .filter(d => d.dueAt !== undefined && d.dueAt <= beforeMs && d.expireAt > Date.now())
    .sort((a, b) => (a.dueAt as number) - (b.dueAt as number)).slice(0, limit)
    .map(d => ({ id: d.id, data: d.data as T, dueAt: d.dueAt as number }));
}
