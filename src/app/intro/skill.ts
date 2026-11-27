/**
 * Nivån som den spåras: provet i startrundan, flyttat av varven sedan dess.
 *
 * Provet är åtta till tio kort. Det räcker för att börja, men inte för att
 * veta — en lyckad gissning flyttar det ett steg, och den som var trött den
 * kvällen hamnar ett steg för lågt. Varven rättar det.
 *
 * **Bara ord som aldrig setts räknas**, och bara första gången. Det är de enda
 * kort där «rätt i tempo» betyder *kunde redan*. Satt nästan alla låg listan
 * under nivån; satt nästan inga låg den över. En lista mitt emellan är en
 * lista som gör sitt jobb, och säger inget nytt.
 *
 * Nivån flyttas aldrig längre än listan bär. Den som klarar en lista skriven
 * för steg 1 har inte visat att hen kan steg 6, bara att hen kan steg 2 — och
 * den som kan steg 6 sedan förut står kvar där.
 *
 * Allt här är rent. Anteckningarna görs av `ProfileStore.noteRound()`.
 */
import { wordsOnStep } from './intro-run';
import { Profile, RoundNote, TOP_LEVEL } from './profile';

/** Nya kort ett varv behöver för att säga något om nivån. Ett varv med tio nya ord har tjugo. */
export const MIN_ANSWERED = 8;

/**
 * Andel rätt i tempo på första varvet som betyder att listan var för lätt,
 * och den som betyder att den var för svår.
 *
 * Inte symmetriska, och det är med flit: ett sant/falskt-kort är ett myntkast,
 * så den som chansar på allt hamnar kring hälften. Under en fjärdedel betyder
 * att även gissningarna tröt — eller att hen ärligt sa vet ej.
 *
 * ANTAGANDE: satta på känsla.
 */
export const TOO_EASY = 0.85;
export const TOO_HARD = 0.25;

/** Nivån som listorna skrivs mot, 0–`TOP_LEVEL`, eller `null` om inget vet. */
export function skillOf(profile: Profile): number | null {
  const rounds = profile.rounds ?? [];
  let skill = profile.level ?? rounds.find(counts)?.aim ?? null;
  if (skill === null) {
    return null;
  }
  for (const round of rounds) {
    skill = moved(skill, round);
  }
  return skill;
}

/** Nivån efter ett varv. */
export function moved(skill: number, round: RoundNote): number {
  if (!counts(round)) {
    return skill;
  }
  const rate = round.hits / round.answered;
  if (rate >= TOO_EASY) {
    return Math.min(TOP_LEVEL, Math.max(skill, round.aim + 1));
  }
  if (rate <= TOO_HARD) {
    return Math.max(0, Math.min(skill, round.aim - 1));
  }
  return skill;
}

function counts(round: RoundNote): boolean {
  return round.answered >= MIN_ANSWERED;
}

/**
 * Nivån som modellen får läsa den: med *orden* och inte med en siffra.
 *
 * «Nivå 3 av 9» betyder något bara för den som sett trappan; «klarar although
 * men inte reluctant» betyder samma sak för alla som kan engelska, och det är
 * en sådan läsare som ska välja nästa ord.
 */
export function describeSkill(profile: Profile): string | null {
  const skill = skillOf(profile);
  if (skill === null) {
    return null;
  }
  const lines = [levelText(skill)];
  if (profile.level !== null && skill !== profile.level) {
    lines.push(
      skill > profile.level
        ? 'Det är högre än provet i början sa: eleven har klarat nya listor nästan felfritt på första försöket.'
        : 'Det är lägre än provet i början sa: nya listor har varit för svåra på första försöket.',
    );
  }
  return lines.join(' ');
}

function levelText(level: number): string {
  const passed = quoted(level > 0 ? wordsOnStep(level - 1) : []);
  const failed = quoted(wordsOnStep(level));
  if (level <= 0) {
    return `Nivå: klarar inte de lättaste orden (${failed}) än. Börja från början.`;
  }
  if (level >= TOP_LEVEL) {
    return `Nivå: klarar även ord som ${passed}. Välj ord som utmanar någon som läser engelska obehindrat — inga ord en gymnasieelev redan kan.`;
  }
  return `Nivå: klarar ord som ${passed}, men inte ${failed}.`;
}

function quoted(words: readonly string[]): string {
  return words.map((word) => `«${word}»`).join(' och ');
}

/**
 * Nivån som den sägs till den som övar.
 *
 * Sagd som var det är lagom att börja och inte som ett betyg: den som nyss
 * svept fel på `house` ska inte mötas av en nolla.
 */
export function sayLevel(level: number): string {
  if (level <= 0) {
    return 'Vi börjar från början, med de vanligaste orden.';
  }
  if (level <= 2) {
    return 'Du kan vardagsorden. Vi bygger vidare därifrån.';
  }
  if (level <= 4) {
    return 'Du kan mer än vardagsorden. Det blir ord med lite motstånd.';
  }
  if (level <= 6) {
    return 'Du har ett stort ordförråd. Det blir ord som inte står i läroboken.';
  }
  if (level < TOP_LEVEL) {
    return 'Du kan mycket redan. Det blir ord som får dig att tänka efter.';
  }
  return 'Du klarade allt jag hade. Nu får jag leta efter ord du inte kan.';
}
