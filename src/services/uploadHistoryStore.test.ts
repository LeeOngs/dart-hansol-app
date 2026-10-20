import { describe, it, expect, beforeEach } from 'vitest';
import { reserveNextUploadId, addUploadHistoryEntry, loadUploadHistory } from './uploadHistoryStore';
import type { UploadIdReservation } from './uploadHistoryStore';
import type { UploadHistoryEntry } from '../types';

describe('reserveNextUploadId', () => {
  it('starts sequence at 001 for a day with no existing entries and no prior reservation', () => {
    const { id } = reserveNextUploadId(null, []);
    expect(id).toMatch(/^\d{8}-001$/);
  });

  it('continues from existing entries when there is no prior in-memory reservation yet', () => {
    const todayPrefix = reserveNextUploadId(null, []).id.split('-')[0];
    const existing: UploadHistoryEntry[] = [
      { id: `${todayPrefix}-001`, label: 'a', createdAt: '', rawCompanies: [], analysisResults: [] },
      { id: `${todayPrefix}-002`, label: 'b', createdAt: '', rawCompanies: [], analysisResults: [] }
    ];
    expect(reserveNextUploadId(null, existing).id).toBe(`${todayPrefix}-003`);
  });

  it('ignores sequences from other dates', () => {
    const existing: UploadHistoryEntry[] = [
      { id: '19990101-999', label: 'old', createdAt: '', rawCompanies: [], analysisResults: [] }
    ];
    expect(reserveNextUploadId(null, existing).id).toMatch(/^\d{8}-001$/);
  });

  it('keeps two reservations distinct even when neither has been saved to history yet', () => {
    // This is the concurrent-upload case: upload A reserves, then upload B
    // reserves before A's (slow) analysis has saved anything to history.
    const first = reserveNextUploadId(null, []);
    const second = reserveNextUploadId(first.reservation, [] /* A hasn't saved yet */);
    expect(second.id).not.toBe(first.id);
    expect(second.id).toBe(`${first.id.split('-')[0]}-002`);
  });

  it('carries the running reservation forward across multiple calls without needing history to catch up', () => {
    let reservation: UploadIdReservation | null = null;
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const result = reserveNextUploadId(reservation, []);
      reservation = result.reservation;
      ids.push(result.id);
    }
    const prefix = ids[0].split('-')[0];
    expect(ids).toEqual([1, 2, 3, 4].map((n) => `${prefix}-${String(n).padStart(3, '0')}`));
  });
});

describe('addUploadHistoryEntry', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists a new entry and makes it retrievable via loadUploadHistory', () => {
    const { id } = reserveNextUploadId(null, []);
    const { entry, history } = addUploadHistoryEntry([], {
      id,
      label: '테스트 업로드',
      rawCompanies: [],
      analysisResults: []
    });
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe(entry.id);
    expect(loadUploadHistory()).toHaveLength(1);
  });

  it('prepends new entries so the newest is first', () => {
    const idA = reserveNextUploadId(null, []);
    const first = addUploadHistoryEntry([], { id: idA.id, label: 'first', rawCompanies: [], analysisResults: [] });
    const idB = reserveNextUploadId(idA.reservation, first.history);
    const second = addUploadHistoryEntry(first.history, { id: idB.id, label: 'second', rawCompanies: [], analysisResults: [] });
    expect(second.history[0].label).toBe('second');
    expect(second.history[1].label).toBe('first');
  });

  it('saves two concurrently-reserved uploads under their own distinct ids and labels', () => {
    // Reproduces the real bug: both ids are reserved up front (as App.tsx
    // does at upload-start time), and only afterwards do the two analyses
    // finish and save — in reverse order, since the second upload can finish
    // its DART analysis before the first one does.
    const reservedA = reserveNextUploadId(null, []);
    const reservedB = reserveNextUploadId(reservedA.reservation, []);

    const savedB = addUploadHistoryEntry([], { id: reservedB.id, label: '테스트01', rawCompanies: [], analysisResults: [] });
    const savedA = addUploadHistoryEntry(savedB.history, { id: reservedA.id, label: '업로드 자동라벨', rawCompanies: [], analysisResults: [] });

    const byId = Object.fromEntries(savedA.history.map((e) => [e.id, e.label]));
    expect(byId[reservedA.id]).toBe('업로드 자동라벨');
    expect(byId[reservedB.id]).toBe('테스트01');
    expect(savedA.history).toHaveLength(2);
  });
});
