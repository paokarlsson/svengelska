/**
 * Hur övningen gått, som modellen får läsa det när den skriver nästa lista.
 *
 * Profilen säger vem någon är och vad startrundan trodde. Det här säger vad
 * som faktiskt hänt sedan: vilka ord som tar emot, vilka som sitter, och hur
 * lång tid de tar. Tiden är det mest ärliga måttet appen har — ett ord som
 * svaras rätt men på dubbla tiden är inte ett ord eleven kan, bara ett hen kan
 * räkna ut — och den skickas som kvot mot elevens golv, alltså tiden för ett
 * ord hen redan kan. «Två gånger golvet» betyder samma sak på en snabb och en
 * långsam telefon.
 *
 * Allt här är rent. Det som läses in kommer från `TrainingEngine` via
 * `ListWriter`.
 */
import { Channel } from '../services/progress-store';
import { Outcome, StepStat } from '../training/word-state';
import { Direction, WordPair } from './word-catalog';

/** Ett ord åt ett håll, och vad som mätts på det. */
export interface PracticeWord {
  pair: WordPair;
  direction: Direction;
  stat: StepStat;
}

/** Så många svåra och lätta ord som nämns. Fler än så är en vägg och ingen upplysning. */
export const HARD_SHOWN = 12;
export const EASY_SHOWN = 10;

/** Över så här många gånger golvet räknas ett rätt svar som segt i texten. */
const SLOW_PACE = 1.5;

const OUTCOME_TEXT: Record<Outcome, string> = {
  hit: 'rätt',
  slow: 'segt',
  miss: 'fel',
  unsure: 'vet ej',
};

/** Hur övningen gått, eller `null` om inget övats än. */
export function describePractice(
  words: readonly PracticeWord[],
  floors: Record<Channel, number>,
): string | null {
  const seen = words.filter((word) => word.stat.attempts > 0);
  if (seen.length === 0) {
    return null;
  }
  const answers = seen.reduce((sum, word) => sum + word.stat.attempts, 0);
  const recent = seen.flatMap((word) => word.stat.recent);
  const hits = recent.filter((outcome) => outcome === 'hit').length;
  const lines = [
    `${seen.length} ord åt något håll har övats, med ${answers} svar. Av de senaste svaren per ord var ${percent(hits, recent.length)} rätt i tempo.`,
    `Golvet — tiden för ett ord eleven redan kan — är ungefär ${seconds(average(floors['en:true'], floors['en:false']))} från engelska och ${seconds(average(floors['sv:true'], floors['sv:false']))} från svenska. Tider nedan är gånger golvet.`,
  ];

  const hard = seen
    .map((word) => ({ word, score: difficulty(word.stat) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, HARD_SHOWN);
  if (hard.length > 0) {
    lines.push('Svårast just nu — fel, vet ej eller segt:');
    lines.push(...hard.map(({ word }) => `- ${line(word)}`));
  }

  const easy = seen
    .filter((word) => sits(word.stat))
    .sort((a, b) => (median(a.stat.paces) ?? 9) - (median(b.stat.paces) ?? 9))
    .slice(0, EASY_SHOWN);
  if (easy.length > 0) {
    lines.push('Sitter — rätt och i tempo varje gång på sistone:');
    lines.push(...easy.map((word) => `- ${line(word)}`));
  }
  return lines.join('\n');
}

/**
 * Hur mycket ett ord tar emot. Fel väger tyngst, sedan «vet ej», sedan segt —
 * och ett rätt som tog mer än en och en halv gång golvet räknas som segt även
 * om det var under tröskeln för planen.
 */
export function difficulty(stat: StepStat): number {
  let score = 0;
  for (const outcome of stat.recent) {
    score += outcome === 'miss' ? 2 : outcome === 'unsure' ? 1.5 : outcome === 'slow' ? 1 : 0;
  }
  const pace = median(stat.paces);
  if (pace !== null && pace > SLOW_PACE) {
    score += pace - SLOW_PACE;
  }
  return score;
}

/** Om ordet sitter: några svar, alla rätt i tempo. */
function sits(stat: StepStat): boolean {
  return stat.recent.length >= 2 && stat.recent.every((outcome) => outcome === 'hit');
}

function line(word: PracticeWord): string {
  const { pair, direction, stat } = word;
  const shown = direction === 'en' ? `${pair.en} → ${pair.sv}` : `${pair.sv} → ${pair.en}`;
  const pace = median(stat.paces);
  const parts = [
    `${stat.correct} rätt av ${stat.attempts}`,
    `senast: ${stat.recent.map((outcome) => OUTCOME_TEXT[outcome]).join(', ')}`,
  ];
  if (pace !== null) {
    parts.push(`tid ×${decimal(pace)}`);
  }
  return `${shown}: ${parts.join('; ')}`;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function average(a: number, b: number): number {
  return (a + b) / 2;
}

function percent(part: number, whole: number): string {
  return whole === 0 ? '0 %' : `${Math.round((part / whole) * 100)} %`;
}

function decimal(value: number): string {
  return value.toFixed(1).replace('.', ',');
}

function seconds(value: number): string {
  return `${decimal(value)} s`;
}
