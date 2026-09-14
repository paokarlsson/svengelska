/**
 * Lagret, och ingenting annat.
 *
 * Den enda filen i appen som vet *var* framstegen ligger. Resten ber om ett
 * dokument och får ett tillbaka. Går appen senare över till en backend är det
 * bara `ProgressRepository` som behöver en ny implementation — pedagogiken,
 * progressionen och gränssnittet ska kunna ligga kvar orörda.
 *
 * Gränssnittet är asynkront fast `localStorage` inte är det. Det är avsiktligt:
 * ett löfte går att uppfylla synkront, men en synkron signatur går inte att
 * göra asynkron i efterhand utan att varje anropare skrivs om.
 */
import { STEPS, Step, StepStat, WordRecord, emptyRecord, emptyStat } from '../training/word-state';

/**
 * Formen på det som ligger i lagret. Höjs när dokumentet ändrar form, och
 * `migrate()` får då sin första gren. Att raden finns från början är den enda
 * lärdom från `ganger` som kostar noll att ta med: där saknade version 1 ett
 * versionsnummer och måste kännas igen på formen av sina nycklar i stället.
 */
export const SCHEMA_VERSION = 1;

/** Allt appen minns om den som övat, under en nyckel. */
export const PROGRESS_KEY = 'svengelska-progress';

/**
 * Så många mätningar som sparas per ord och steg, och så många som baslinjen
 * är medianen av.
 *
 * Baslinjen mäts per steg och aldrig delat. Ett svep är ett finger, ett skrivet
 * svar är ett ord på ett tangentbord, och en gemensam skala hade fått halva
 * blocket att se behärskat ut på fel grund.
 */
export const MAX_SAMPLES = 5;
export const BASELINE_WINDOW = 8;

/**
 * Färre mätningar än så säger mer om slumpen än om spelaren, och då används
 * stegets grundvärde i stället.
 */
export const MIN_BASELINE_SAMPLES = 3;

/**
 * Farten ett steg antas ha innan spelaren mätts, i sekunder.
 *
 * ANTAGANDE: satt på känsla, och det är hela poängen med att den mäts om. Se
 * docs/plan.md.
 */
export const DEFAULT_BASELINE: Record<Step, number> = {
  match: 3.0,
  trueFalse: 1.6,
  recall: 2.5,
  written: 6.0,
};

export interface ProgressDocument {
  schemaVersion: number;
  /**
   * Nyckeln är maskinläsbar och stabil: `en:dog=hund`. Prefixet lämnar plats
   * för andra språkriktningar — `sv:hund=dog` — utan att dokumentet behöver
   * göras om, och båda sidorna ingår för att `can = kan` och `can = burk` ska
   * vara två glosor och inte en.
   */
  words: Record<string, WordRecord>;
  /** Rullande fönster av sekunder per steg. Medianen är stegets baslinje. */
  baselines: Record<Step, number[]>;
  /** Blocket som övas just nu, `null` innan något valts. */
  activeBlockId: string | null;
}

/** Läser och skriver. Ingen pedagogik, inga trösklar, inga beslut. */
export interface ProgressRepository {
  load(): Promise<ProgressDocument>;
  save(document: ProgressDocument): Promise<void>;
  clear(): Promise<void>;
}

export function emptyBaselines(): Record<Step, number[]> {
  return { match: [], trueFalse: [], recall: [], written: [] };
}

export function emptyDocument(): ProgressDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    words: {},
    baselines: emptyBaselines(),
    activeBlockId: null,
  };
}

/** Om dokumentet innehåller något alls — det `clear()` har att rensa. */
export function hasContent(document: ProgressDocument): boolean {
  return (
    Object.keys(document.words).length > 0 ||
    STEPS.some((step) => document.baselines[step].length > 0)
  );
}

/** Stegets baslinje i sekunder: medianen av fönstret, eller grundvärdet. */
export function baselineFor(document: ProgressDocument, step: Step): number {
  const samples = document.baselines[step];
  if (samples.length < MIN_BASELINE_SAMPLES) {
    return DEFAULT_BASELINE[step];
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/**
 * Framstegen i webbläsaren de övats i.
 *
 * `localStorage` kan kasta i privat läge och när sajtdata är avstängt. Appen
 * ska gå att öva i ändå, bara utan att framstegen följer med — därför sväljs
 * varje fel här och ingenstans annars.
 */
export class LocalStorageProgressRepository implements ProgressRepository {
  async load(): Promise<ProgressDocument> {
    return normalize(this.read(PROGRESS_KEY));
  }

  async save(document: ProgressDocument): Promise<void> {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(document));
    } catch {
      // Framstegen får leva kvar i minnet under sessionen.
    }
  }

  async clear(): Promise<void> {
    try {
      localStorage.removeItem(PROGRESS_KEY);
    } catch {
      // Se save().
    }
  }

  private read(key: string): unknown {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? null : (JSON.parse(raw) as unknown);
    } catch {
      return null;
    }
  }
}

/**
 * Ett dokument som legat i en webbläsare är inte att lita på: en användare kan
 * ha redigerat det, och en äldre eller nyare version av appen kan ha skrivit
 * det. Allt som inte går att känna igen ersätts med sitt tomma värde i stället
 * för att krascha övningen.
 */
export function normalize(stored: unknown): ProgressDocument {
  if (!isRecord(stored)) {
    return emptyDocument();
  }

  const document = emptyDocument();
  if (isRecord(stored['words'])) {
    for (const [key, value] of Object.entries(stored['words'])) {
      document.words[key] = normalizeRecord(value);
    }
  }
  if (isRecord(stored['baselines'])) {
    for (const step of STEPS) {
      document.baselines[step] = numberList(stored['baselines'][step]).slice(-BASELINE_WINDOW);
    }
  }
  const block = stored['activeBlockId'];
  document.activeBlockId = typeof block === 'string' ? block : null;
  return document;
}

function normalizeRecord(value: unknown): WordRecord {
  if (!isRecord(value)) {
    return emptyRecord();
  }
  const record = emptyRecord();
  for (const step of STEPS) {
    record[step] = normalizeStat(value[step]);
  }
  return record;
}

function normalizeStat(value: unknown): StepStat {
  if (!isRecord(value)) {
    return emptyStat();
  }
  return {
    attempts: wholeNumber(value['attempts']),
    correct: wholeNumber(value['correct']),
    streak: wholeNumber(value['streak']),
    paces: numberList(value['paces']).slice(-MAX_SAMPLES),
    recent: boolList(value['recent']).slice(-MAX_SAMPLES),
    lastSeen: parseNumber(value['lastSeen']),
  };
}

function numberList(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item));
}

function boolList(value: unknown): boolean[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is boolean => typeof item === 'boolean');
}

function wholeNumber(value: unknown): number {
  const parsed = parseNumber(value);
  return parsed === null || parsed < 0 ? 0 : Math.floor(parsed);
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
