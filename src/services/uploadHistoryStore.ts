import type { CompanyAnalysisResult, CompanyRawData, UploadHistoryEntry } from '../types';

const STORAGE_KEY = 'dart_upload_history';
const MAX_ENTRIES = 30;

export function loadUploadHistory(): UploadHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(entries: UploadHistoryEntry[]): UploadHistoryEntry[] {
  let toStore = entries;
  while (toStore.length > 0) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
      return toStore;
    } catch {
      // Likely a localStorage quota error — drop the oldest entry and retry.
      toStore = toStore.slice(0, -1);
    }
  }
  localStorage.removeItem(STORAGE_KEY);
  return [];
}

function todayDatePrefix(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

export interface UploadIdReservation {
  date: string;
  nextSeq: number;
}

/**
 * Reserves the next upload id from the caller's own running reservation
 * (not just from `existingHistory`). This must be called synchronously the
 * moment each upload STARTS, before its (possibly slow, real-DART) analysis
 * runs. Two uploads can be mid-analysis at the same time — deriving the next
 * sequence number lazily from `existingHistory` only at save time would let
 * both see the same "existing" snapshot and reserve the same id.
 */
export function reserveNextUploadId(
  reservation: UploadIdReservation | null,
  existingHistory: UploadHistoryEntry[]
): { id: string; reservation: UploadIdReservation } {
  const prefix = todayDatePrefix();
  let nextSeq: number;

  if (reservation && reservation.date === prefix) {
    nextSeq = reservation.nextSeq;
  } else {
    const todaysSeqs = existingHistory
      .filter((e) => e.id.startsWith(`${prefix}-`))
      .map((e) => parseInt(e.id.slice(prefix.length + 1), 10))
      .filter((n) => !Number.isNaN(n));
    nextSeq = (todaysSeqs.length > 0 ? Math.max(...todaysSeqs) : 0) + 1;
  }

  return {
    id: `${prefix}-${String(nextSeq).padStart(3, '0')}`,
    reservation: { date: prefix, nextSeq: nextSeq + 1 }
  };
}

export function defaultUploadLabel(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `업로드 ${y}-${m}-${d}`;
}

/**
 * Adds a new upload as a permanent history entry (newest first), pruning the
 * oldest entries beyond MAX_ENTRIES so localStorage doesn't grow unbounded.
 *
 * `id` must be reserved by the caller (via `generateUploadId`) at the moment
 * the upload starts, not here — two uploads can be analyzing concurrently
 * (e.g. a second file dropped before the first's DART lookups finish), and
 * generating the id lazily from `existing` at save time would let both races
 * see the same "existing" snapshot and reserve the same id.
 */
export function addUploadHistoryEntry(
  existing: UploadHistoryEntry[],
  params: { id: string; label: string; rawCompanies: CompanyRawData[]; analysisResults: CompanyAnalysisResult[] }
): { entry: UploadHistoryEntry; history: UploadHistoryEntry[] } {
  const entry: UploadHistoryEntry = {
    id: params.id,
    label: params.label,
    createdAt: new Date().toISOString(),
    rawCompanies: params.rawCompanies,
    analysisResults: params.analysisResults
  };

  const updated = [entry, ...existing].slice(0, MAX_ENTRIES);
  return { entry, history: persist(updated) };
}
