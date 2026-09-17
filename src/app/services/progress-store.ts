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
import {
  Outcome,
  STEPS,
  Step,
  StepStat,
  WordRecord,
  emptyRecord,
  emptyStat,
} from '../training/word-state';
import { DIRECTIONS, Direction } from '../words/word-catalog';

/**
 * Formen på det som ligger i lagret.
 *
 * Höjd till 2 av den nerskalade grenen, och det är första gången raden gör
 * nytta: baslinjerna delades upp i kanaler, utfallet blev fyrsiffrigt i stället
 * för ett `boolean`, och dokumentet fick inställningar. `migrate()` har därför
 * äntligen sin första gren, vilket är vad versionsnumret alltid var till för.
 */
export const SCHEMA_VERSION = 2;

/** Allt appen minns om den som övat, under en nyckel. */
export const PROGRESS_KEY = 'svengelska-progress';

/**
 * Så många mätningar som sparas per ord, och så många som baslinjen är
 * medianen av.
 */
export const MAX_SAMPLES = 5;
export const BASELINE_WINDOW = 8;

/**
 * Färre mätningar än så säger mer om slumpen än om spelaren, och då används
 * kanalens grundvärde i stället.
 */
export const MIN_BASELINE_SAMPLES = 3;

/**
 * Kanalen en fart mäts i: riktning × sanningsvärde.
 *
 * Fyra golv och inte ett, och skälet är att de fyra ligger på olika tidsskalor
 * av skäl som inte har med kunnandet att göra. Att svara «rätt» på `dog = hund`
 * är igenkänning; att svara «fel» på `dog = katt` är igenkänning *plus ett
 * aktivt förkastande*, och det tar längre tid för alla — även för den som kan
 * ordet perfekt. Mäts båda mot samma snitt får varje falskt påstående en
 * straffavgift, och eftersom ungefär hälften av korten är falska blir hälften
 * av alla farter systematiskt för höga.
 *
 * Samma sak åt andra hållet: `hund → dog` är den svårare riktningen, och att
 * jämföra den med `dog → hund`:s golv vore att mäta färdigheten mot fel måttband.
 */
export type Channel = `${Direction}:${'true' | 'false'}`;

export const CHANNELS: readonly Channel[] = DIRECTIONS.flatMap(
  (direction): Channel[] => [`${direction}:true`, `${direction}:false`],
);

/** Kanalen ett påstående hör hemma i. */
export function channelFor(direction: Direction, truthy: boolean): Channel {
  return `${direction}:${truthy ? 'true' : 'false'}`;
}

/**
 * Farten en kanal antas ha innan spelaren mätts, i sekunder.
 *
 * Att förkasta antas ta längre tid än att bekräfta, och svenskan som fråga
 * längre tid än engelskan. Trappan är resonerad men inte mätt — och det är hela
 * poängen med att kalibreringen mäter om den varje varv.
 *
 * ANTAGANDE: satt på känsla. Se docs/nerskalad.md.
 */
export const DEFAULT_BASELINE: Record<Channel, number> = {
  'en:true': 1.6,
  'en:false': 2.0,
  'sv:true': 2.0,
  'sv:false': 2.4,
};

/**
 * Hur många nya ord ett dygn får introducera innan panelen rörts.
 *
 * ANTAGANDE: satt på känsla. Se docs/nerskalad.md.
 */
export const DEFAULT_NEW_PER_DAY = 5;

/** Taket panelen erbjuder. Fler nya ord på en dag är inte en inställning. */
export const MAX_NEW_PER_DAY = 20;

/** Det den som övar har ställt in. Egenskap hos personen, inte hos enheten. */
export interface Settings {
  newWordsPerDay: number;
}

export interface ProgressDocument {
  schemaVersion: number;
  /**
   * Nyckeln är maskinläsbar och stabil: `en:dog=hund` och `sv:hund=dog`.
   * Prefixet bär riktningen, och båda sidorna ingår för att `can = kan` och
   * `can = burk` ska vara två glosor och inte en.
   */
  words: Record<string, WordRecord>;
  /** Rullande fönster av sekunder per kanal. Medianen är kanalens baslinje. */
  baselines: Record<Channel, number[]>;
  /** Listan nya ord hämtas ur, `null` innan något valts. */
  activeBlockId: string | null;
  settings: Settings;
}

/** Läser och skriver. Ingen pedagogik, inga trösklar, inga beslut. */
export interface ProgressRepository {
  load(): Promise<ProgressDocument>;
  save(document: ProgressDocument): Promise<void>;
  clear(): Promise<void>;
}

export function emptyBaselines(): Record<Channel, number[]> {
  return { 'en:true': [], 'en:false': [], 'sv:true': [], 'sv:false': [] };
}

export function defaultSettings(): Settings {
  return { newWordsPerDay: DEFAULT_NEW_PER_DAY };
}

export function emptyDocument(): ProgressDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    words: {},
    baselines: emptyBaselines(),
    activeBlockId: null,
    settings: defaultSettings(),
  };
}

/** Om dokumentet innehåller något alls — det `clear()` har att rensa. */
export function hasContent(document: ProgressDocument): boolean {
  return (
    Object.keys(document.words).length > 0 ||
    CHANNELS.some((channel) => document.baselines[channel].length > 0)
  );
}

/** Kanalens baslinje i sekunder: medianen av fönstret, eller grundvärdet. */
export function baselineFor(document: ProgressDocument, channel: Channel): number {
  const samples = document.baselines[channel];
  if (samples.length < MIN_BASELINE_SAMPLES) {
    return DEFAULT_BASELINE[channel];
  }
  return median(samples);
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
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
  readBaselines(document, stored);

  const block = stored['activeBlockId'];
  document.activeBlockId = typeof block === 'string' ? block : null;
  document.settings = normalizeSettings(stored['settings']);
  return document;
}

/**
 * Baslinjerna, och migreringen från version 1.
 *
 * Version 1 höll ett fönster per *steg*. Det som fanns i `trueFalse` är mätt på
 * samma gest som kanalerna mäter, men utan att skilja på riktning eller
 * sanningsvärde — alltså ett medelvärde av fyra saker. Att så det i alla fyra
 * kanalerna är ändå bättre än att börja från grundvärdena: det är spelarens
 * egen tumme, och kalibreringen skriver över det inom ett varv ändå.
 */
function readBaselines(document: ProgressDocument, stored: Record<string, unknown>): void {
  const raw = stored['baselines'];
  if (!isRecord(raw)) {
    return;
  }

  const legacy = numberList(raw['trueFalse']);
  for (const channel of CHANNELS) {
    const own = numberList(raw[channel]);
    document.baselines[channel] = (own.length > 0 ? own : legacy).slice(-BASELINE_WINDOW);
  }
}

function normalizeSettings(value: unknown): Settings {
  if (!isRecord(value)) {
    return defaultSettings();
  }
  const perDay = parseNumber(value['newWordsPerDay']);
  if (perDay === null) {
    return defaultSettings();
  }
  return { newWordsPerDay: clampWhole(perDay, 0, MAX_NEW_PER_DAY) };
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
    recent: outcomeList(value['recent']).slice(-MAX_SAMPLES),
    lastSeen: parseNumber(value['lastSeen']),
    firstSeen: parseNumber(value['firstSeen']),
    box: wholeNumber(value['box']),
  };
}

/**
 * Utfallen, och migreringen från version 1.
 *
 * Version 1 skrev `boolean[]`. `true` blir `hit` och `false` blir `miss`:
 * ingenting som lagrats före grenen kan vara en lucka, eftersom gesten inte
 * fanns, och ingenting kan vara `slow`, eftersom kanalgolven som avgör det inte
 * heller fanns. Att gissa något annat vore att hitta på data.
 */
function outcomeList(value: unknown): Outcome[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const outcomes: Outcome[] = [];
  for (const item of value) {
    if (item === true) {
      outcomes.push('hit');
    } else if (item === false) {
      outcomes.push('miss');
    } else if (isOutcome(item)) {
      outcomes.push(item);
    }
  }
  return outcomes;
}

function isOutcome(value: unknown): value is Outcome {
  return value === 'hit' || value === 'slow' || value === 'miss' || value === 'unsure';
}

function numberList(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item));
}

function wholeNumber(value: unknown): number {
  const parsed = parseNumber(value);
  return parsed === null || parsed < 0 ? 0 : Math.floor(parsed);
}

function clampWhole(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
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

/** Återexporterad för vyerna, som inte ska behöva känna till stegen. */
export type { Step };
