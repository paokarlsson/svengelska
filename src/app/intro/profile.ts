/**
 * Vad appen vet om den som övar, utöver mätningarna.
 *
 * Framstegsdokumentet säger vad någon *kan*, ord för ord. Det här säger vem hen
 * är: vad hen tycker om, ungefär hur gammal hen är, om hen övar för att hen
 * vill, hur hen vill ha det — och var det är lagom att lägga orden. Det är vad
 * som gör att samma app kan skriva en lista åt en tioåring som gillar hästar
 * och en åt en fyrtiofemåring som reser i jobbet, utan att någon av dem ställer
 * in en nivå.
 *
 * Två saker här *spåras* och sätts inte bara en gång:
 *
 * - **Nivån.** Startrundans prov ger en första gissning (`level`). Varven
 *   flyttar den sedan (`rounds`), och det är den flyttade nivån listorna
 *   skrivs mot. Se `skill.ts`.
 * - **Personligheten.** Startrundan frågar om fem drag (`traits`), och vad
 *   någon faktiskt gör — avbryter varv, chansar, säger vet ej — samlas i
 *   `habits`. Se `personality.ts`.
 *
 * I båda fallen lagras det som hänt och inte slutsatsen. Vad appen tror om
 * nivån och personligheten räknas fram vid läsning, av samma skäl som ett ords
 * etikett gör det i framstegsdokumentet: sparas både underlaget och slutsatsen
 * kan de glida isär.
 *
 * Allt här är valfritt. Den som hoppade över en fråga har `null` där, och en
 * profil med bara `null` är en giltig profil: appen vet då inget och frågar
 * modellen utan att låtsas något annat.
 */

/** Åldern som ett spann. Ett år vore mer än appen behöver veta. */
export type AgeBand = 'child' | 'teen' | 'adult';

/**
 * Så många trappsteg nivåprovet har. Noll är «klarade inget av dem».
 *
 * Var fem fram till version 2 av profilen, med `meticulous` som översta steg.
 * Det räckte inte för en vuxen som läser engelska till vardags: hen nådde taket
 * på åtta kort och fick sedan en lista om mjöl och deg.
 */
export const TOP_LEVEL = 9;

/** Profilens form. Höjs när ett fält byter betydelse, inte när ett tillkommer. */
export const PROFILE_VERSION = 2;

/**
 * Version 1:s nivåer på version 2:s skala. Stegen som fanns kvar fick nya
 * platser när trappan fick fler: `meticulous` var steg 4 och är nu steg 5.
 * Den som klarade `reluctant` men inte `meticulous` har aldrig prövats på steget
 * emellan, och räknas som att hen inte klarat det.
 */
const LEVEL_FROM_V1 = [0, 1, 2, 3, 4, 6] as const;

/** Ett svar på en följdfråga: påståendet som eleven såg det, och vad hen svepte. */
export interface Note {
  text: string;
  answer: 'yes' | 'no' | 'unsure';
}

/** Dragen startrundan frågar om. Vad de betyder står i `personality.ts`. */
export const TRAIT_IDS = ['challenge', 'playful', 'practical', 'persistent', 'careful'] as const;
export type TraitId = (typeof TRAIT_IDS)[number];

/** Vad någon sa om sig själv: för (1), emot (−1) eller vet ej (0). */
export type Said = -1 | 0 | 1;

/**
 * Vad någon *gör*, räknat. Underlaget för de drag som går att se i övningen.
 *
 * Bara räknare, aldrig en kvot: en kvot ur tre varv och en ur trettio ser
 * likadana ut, och vilken av dem det är avgör hur mycket den får väga.
 */
export interface Habits {
  /** Varv som spelades till slut. */
  finished: number;
  /** Varv som lämnades efter att några kort besvarats. Se `LEFT_AFTER`. */
  left: number;
  /** Fel svar, i varv som räknades. */
  misses: number;
  /** «Vet ej», i varv som räknades. */
  unsure: number;
}

/**
 * Hur ett varvs nya ord gick. Underlaget för att flytta nivån.
 *
 * Bara håll som aldrig setts förut, och bara första försöket på dem, med flit:
 * ett övat ord som sitter säger att övningen fungerar, inte att listan var för
 * lätt.
 */
export interface RoundNote {
  /** Listans id, för den som läser loggen. */
  list: string;
  /** Nivån listan skrevs för, på samma skala som `level`. */
  aim: number;
  /** Aldrig sedda håll som besvarades, och hur många av dem som var rätt i tempo. */
  answered: number;
  hits: number;
}

/** Så många varv nivån minns. De äldsta faller bort; nivån ska kunna röra sig. */
export const ROUNDS_KEPT = 12;

/**
 * Så många kort ett varv ska ha besvarats innan det räknas som lämnat.
 * Den som lämnar på första kortet har valt fel lista, inte gett upp.
 */
export const LEFT_AFTER = 3;

export interface Profile {
  /** Det den som övar sa ja till, som det ska stå i frågan till modellen. */
  interests: string[];
  age: AgeBand | null;
  /** Om hen övar för att hen själv vill. `null` = sa inget. */
  voluntary: boolean | null;
  /**
   * Hur många trappsteg nivåprovet klarades, 0–`TOP_LEVEL`. `null` innan
   * provet gjorts — att inte ha prövats är inte samma sak som att inte kunna.
   *
   * Det här är provets svar och ändras aldrig efteråt. Nivån listorna skrivs
   * mot är `skillOf()` i `skill.ts`, som börjar här och flyttas av varven.
   */
  level: number | null;
  /**
   * Svaren på följdfrågorna som Claude skrev efter startrundan, i den ordning
   * de besvarades. Saknas för den som sa att appen visste nog.
   */
  notes?: Note[];
  /** Vad hen sa om sig själv i startrundan, drag för drag. Saknas = inte frågad. */
  traits?: Partial<Record<TraitId, Said>>;
  /** Vad hen gjort sedan. Saknas tills första varvet. */
  habits?: Habits;
  /** Första varvet på de senaste listorna, äldst först. */
  rounds?: RoundNote[];
}

export function emptyProfile(): Profile {
  return { interests: [], age: null, voluntary: null, level: null };
}

export function emptyHabits(): Habits {
  return { finished: 0, left: 0, misses: 0, unsure: 0 };
}

/** Om profilen säger något alls. En tom profil ska inte nämnas för modellen. */
export function saysSomething(profile: Profile): boolean {
  return (
    profile.interests.length > 0 ||
    profile.age !== null ||
    profile.voluntary !== null ||
    profile.level !== null ||
    (profile.notes?.length ?? 0) > 0 ||
    Object.values(profile.traits ?? {}).some((said) => said !== 0)
  );
}

/**
 * En profil ur något som kanske är en profil.
 *
 * Samma hållning som `normalize()` i `progress-store.ts`: det som känns igen
 * behålls, resten blir sitt tomma värde. En profil utan versionsrad är skriven
 * av version 1, och dess nivå flyttas till den nya trappans skala.
 */
export function readProfile(value: unknown): Profile {
  const profile = emptyProfile();
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return profile;
  }
  const raw = value as Record<string, unknown>;
  const legacy = raw['version'] !== PROFILE_VERSION;

  if (Array.isArray(raw['interests'])) {
    profile.interests = raw['interests']
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim());
  }
  if (raw['age'] === 'child' || raw['age'] === 'teen' || raw['age'] === 'adult') {
    profile.age = raw['age'];
  }
  if (typeof raw['voluntary'] === 'boolean') {
    profile.voluntary = raw['voluntary'];
  }
  if (isNumber(raw['level'])) {
    profile.level = legacy
      ? LEVEL_FROM_V1[clamp(Math.round(raw['level']), 0, LEVEL_FROM_V1.length - 1)]
      : clamp(Math.round(raw['level']), 0, TOP_LEVEL);
  }
  if (Array.isArray(raw['notes'])) {
    const notes = raw['notes'].filter(isNote).map((note) => ({ text: note.text.trim(), answer: note.answer }));
    if (notes.length > 0) {
      profile.notes = notes;
    }
  }

  const traits = readTraits(raw['traits']);
  if (traits !== null) {
    profile.traits = traits;
  }
  const habits = readHabits(raw['habits']);
  if (habits !== null) {
    profile.habits = habits;
  }
  const rounds = Array.isArray(raw['rounds']) ? raw['rounds'].filter(isRoundNote) : [];
  if (rounds.length > 0) {
    profile.rounds = rounds.slice(-ROUNDS_KEPT).map((note) => ({
      list: note.list,
      aim: clamp(note.aim, 0, TOP_LEVEL),
      answered: Math.round(note.answered),
      hits: Math.min(Math.round(note.hits), Math.round(note.answered)),
    }));
  }
  return profile;
}

/** Profilen som den lagras: med versionsraden, så att nästa läsning vet skalan. */
export function storedProfile(profile: Profile): Profile & { version: number } {
  return { version: PROFILE_VERSION, ...profile };
}

function readTraits(value: unknown): Partial<Record<TraitId, Said>> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const traits: Partial<Record<TraitId, Said>> = {};
  let any = false;
  for (const id of TRAIT_IDS) {
    const said = raw[id];
    if (said === -1 || said === 0 || said === 1) {
      traits[id] = said;
      any = true;
    }
  }
  return any ? traits : null;
}

function readHabits(value: unknown): Habits | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const habits = emptyHabits();
  for (const key of Object.keys(habits) as (keyof Habits)[]) {
    const count = raw[key];
    if (isNumber(count) && count >= 0) {
      habits[key] = Math.round(count);
    }
  }
  return habits;
}

function isRoundNote(value: unknown): value is RoundNote {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const raw = value as Record<string, unknown>;
  return (
    typeof raw['list'] === 'string' &&
    isNumber(raw['aim']) &&
    isNumber(raw['answered']) &&
    raw['answered'] >= 0 &&
    isNumber(raw['hits']) &&
    raw['hits'] >= 0
  );
}

function isNote(value: unknown): value is Note {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const raw = value as Record<string, unknown>;
  return (
    typeof raw['text'] === 'string' &&
    raw['text'].trim().length > 0 &&
    (raw['answer'] === 'yes' || raw['answer'] === 'no' || raw['answer'] === 'unsure')
  );
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}
