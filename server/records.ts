import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decryptPayload, encryptPayload } from './crypto.ts';

type VisitRecord = Record<string, unknown> & {
  id: string;
  followups?: Array<Record<string, unknown> & { id: string; completed?: boolean }>;
};

type StoredVisit = {
  id: string;
  encryptedToken: string;
};

const ROOT = process.env.ASHA_PROJECT_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RECORDS_FILE = process.env.ASHA_RECORDS_FILE || path.join(ROOT, 'data', 'visit_records.json');
const DEMO_RECORDS_FILE = path.join(ROOT, 'data', 'sandbox', 'visit_records.json');
let writeQueue = Promise.resolve();

function recordsFile(recordId?: string): string {
  return recordId?.startsWith('DEMO-') ? DEMO_RECORDS_FILE : RECORDS_FILE;
}

async function readStoredVisits(file = RECORDS_FILE): Promise<StoredVisit[]> {
  try {
    const content = await fs.readFile(file, 'utf8');
    const parsed: unknown = JSON.parse(content.replace(/^\uFEFF/, ''));
    const data = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { value?: unknown }).value)
        ? (parsed as { value: unknown[] }).value
        : null;
    if (!data) throw new Error('Stored visit register is invalid.');
    return data.filter((item): item is StoredVisit =>
      Boolean(item && typeof item === 'object' &&
        typeof (item as StoredVisit).id === 'string' &&
        typeof (item as StoredVisit).encryptedToken === 'string')
    );
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  }
}

function decodeVisit(item: StoredVisit): VisitRecord {
  const record: unknown = JSON.parse(decryptPayload(item.encryptedToken));
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error(`Saved visit ${item.id} is invalid.`);
  }
  return record as VisitRecord;
}

async function writeStoredVisits(visits: StoredVisit[], file = RECORDS_FILE): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(visits, null, 2), 'utf8');
}

function serializeWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(operation);
  writeQueue = result.then(() => undefined, () => undefined);
  return result;
}

export async function saveVisitRecord(record: VisitRecord): Promise<string> {
  return serializeWrite(async () => {
    const file = recordsFile(record.id);
    const visits = await readStoredVisits(file);
    const encryptedToken = encryptPayload(record);
    const next = visits.filter((item) => item.id !== record.id);
    next.unshift({ id: record.id, encryptedToken });
    await writeStoredVisits(next, file);
    return encryptedToken;
  });
}

export async function listVisitRecords(): Promise<VisitRecord[]> {
  const visits = await readStoredVisits();
  // Keep unreadable legacy ciphertext in place, but do not let one key-mismatched
  // record take the entire register offline. New records continue to use the
  // current AES-256-GCM key and are returned normally.
  return visits.flatMap((item) => {
    try {
      return [decodeVisit(item)];
    } catch {
      return [];
    }
  });
}

export async function updateVisitFollowup(
  recordId: string,
  followupId: string,
  completed: boolean
): Promise<VisitRecord> {
  return serializeWrite(async () => {
    const file = recordsFile(recordId);
    const visits = await readStoredVisits(file);
    const stored = visits.find((item) => item.id === recordId);
    if (!stored) throw new Error('Saved visit was not found.');

    const record = decodeVisit(stored);
    const followups = record.followups;
    const index = followups?.findIndex((item) => item.id === followupId) ?? -1;
    if (!followups || index < 0) throw new Error('Follow-up was not found.');

    followups[index] = {
      ...followups[index],
      completed,
      completedAt: completed ? new Date().toISOString() : null,
    };
    const encryptedToken = encryptPayload(record);
    visits[visits.indexOf(stored)] = { id: recordId, encryptedToken };
    await writeStoredVisits(visits, file);
    return record;
  });
}

export async function deleteVisitRecords(): Promise<void> {
  await serializeWrite(async () => {
    await fs.rm(RECORDS_FILE, { force: true });
  });
}
