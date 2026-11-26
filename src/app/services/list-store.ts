/**
 * Listorna som kommit till i webbläsaren, och var de ligger.
 *
 * Svaret på frågan `docs/plan.md` lämnade öppen under steg 6 — var en lista som
 * inte kom med bygget *bor*. Den bor under en egen nyckel med en egen version,
 * inte i framstegsdokumentet: en lista är innehåll och framstegen är mätningar,
 * och «Nollställ framstegen» ska ta det ena utan att röra det andra.
 *
 * Läsningen har samma hållning som `normalize()` i `progress-store.ts`: det
 * som inte känns igen faller bort i stället för att krascha övningen, och
 * varje `localStorage`-fel sväljs här och ingen annanstans.
 */
import { WordBlock, parseBlocks } from '../words/word-catalog';

export const LISTS_KEY = 'svengelska-lists';
export const LISTS_VERSION = 1;

/** Det som ligger i lagret. */
interface ListsDocument {
  schemaVersion: number;
  blocks: readonly WordBlock[];
}

/** Listorna ur något som kanske är ett listdokument. */
export function readLists(value: unknown): WordBlock[] {
  if (typeof value !== 'object' || value === null) {
    return [];
  }
  return parseBlocks((value as Record<string, unknown>)['blocks']);
}

export function loadLists(): WordBlock[] {
  try {
    const raw = localStorage.getItem(LISTS_KEY);
    return raw === null ? [] : readLists(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveLists(blocks: readonly WordBlock[]): void {
  const document: ListsDocument = { schemaVersion: LISTS_VERSION, blocks };
  try {
    localStorage.setItem(LISTS_KEY, JSON.stringify(document));
  } catch {
    // Privat läge eller fullt lager: listan finns då sidan ut.
  }
}
