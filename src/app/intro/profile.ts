/**
 * Vad appen vet om den som övar, utöver mätningarna.
 *
 * Framstegsdokumentet säger vad någon *kan*. Det här säger vem hen är: vad hen
 * tycker om, ungefär hur gammal hen är, om hen övar för att hen vill, och var
 * det är lagom att börja. Det är vad som gör att samma app kan skriva en lista
 * åt en tioåring som gillar hästar och en åt en fyrtiofemåring som reser i
 * jobbet, utan att någon av dem ställer in en nivå.
 *
 * Allt här är valfritt. Den som hoppade över en fråga har `null` där, och en
 * profil med bara `null` är en giltig profil: appen vet då inget och frågar
 * modellen utan att låtsas något annat.
 */

/** Åldern som ett spann. Ett år vore mer än appen behöver veta. */
export type AgeBand = 'child' | 'teen' | 'adult';

/** Så många trappsteg nivåprovet har. Noll är «klarade inget av dem». */
export const TOP_LEVEL = 5;

/** Ett svar på en följdfråga: påståendet som eleven såg det, och vad hen svepte. */
export interface Note {
  text: string;
  answer: 'yes' | 'no' | 'unsure';
}

export interface Profile {
  /** Det den som övar sa ja till, som det ska stå i frågan till modellen. */
  interests: string[];
  age: AgeBand | null;
  /** Om hen övar för att hen själv vill. `null` = sa inget. */
  voluntary: boolean | null;
  /**
   * Hur många trappsteg nivåprovet klarades, 0–`TOP_LEVEL`. `null` innan
   * provet gjorts — att inte ha prövats är inte samma sak som att inte kunna.
   */
  level: number | null;
  /**
   * Svaren på följdfrågorna som Claude skrev efter startrundan, i den ordning
   * de besvarades. Saknas för den som sa att appen visste nog.
   */
  notes?: Note[];
}

export function emptyProfile(): Profile {
  return { interests: [], age: null, voluntary: null, level: null };
}

/** Om profilen säger något alls. En tom profil ska inte nämnas för modellen. */
export function saysSomething(profile: Profile): boolean {
  return (
    profile.interests.length > 0 ||
    profile.age !== null ||
    profile.voluntary !== null ||
    profile.level !== null ||
    (profile.notes?.length ?? 0) > 0
  );
}

/**
 * En profil ur något som kanske är en profil.
 *
 * Samma hållning som `normalize()` i `progress-store.ts`: det som känns igen
 * behålls, resten blir sitt tomma värde.
 */
export function readProfile(value: unknown): Profile {
  const profile = emptyProfile();
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return profile;
  }
  const raw = value as Record<string, unknown>;

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
  if (typeof raw['level'] === 'number' && Number.isFinite(raw['level'])) {
    profile.level = Math.max(0, Math.min(TOP_LEVEL, Math.round(raw['level'])));
  }
  if (Array.isArray(raw['notes'])) {
    const notes = raw['notes'].filter(isNote).map((note) => ({ text: note.text.trim(), answer: note.answer }));
    if (notes.length > 0) {
      profile.notes = notes;
    }
  }
  return profile;
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
