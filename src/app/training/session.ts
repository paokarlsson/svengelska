/**
 * Sessionsdirigenten: det som gör de fyra vyerna till ett pass.
 *
 * Den håller blocket, frågar motorn vilket steg nästa ord ska visas i, och
 * lämnar ifrån sig en *uppgift* — inte en vy. Vilken komponent som ritar en
 * uppgift är vyernas sak; vad som ska övas härnäst är den här filens.
 *
 * Det är här appen skiljer sig mest från `ganger`, som har tre spel i en meny.
 * Här finns ingen meny utan en *ingång*: den som övar väljer var veckan börjar
 * och trycker igång, och därefter växlar stegen under fötterna på hen
 * allteftersom orden rör sig. Skillnaden är hela produktprincipen — ingången
 * gäller det första kortet, resten är mätningens.
 *
 * Dirigenten äger inga regler heller. Steget kommer från `word-state.ts`,
 * urvalet från `word-selector.ts`, felsvaren från `distractors.ts`. Det den
 * äger är passets eget minne: vad som nyss visats, vad som missades och ska
 * tillbaka, och hur långt passet har kvar.
 */
import { Statement, statementFor } from '../words/distractors';
import { Random, shuffle } from '../words/shuffle';
import { WordBlock, WordPair, wordKey } from '../words/word-catalog';
import { RECENT_MEMORY, companionsFor, selectNext } from '../words/word-selector';
import { TrainingEngine } from './training-engine';
import { STEPS, Step, WordState, trainingStep } from './word-state';

/** En uppgift på skärmen. Ett kort, utom i Match, som är en hel runda. */
export type Task =
  | { kind: 'match'; pairs: readonly WordPair[] }
  | { kind: 'trueFalse'; statement: Statement }
  | { kind: 'recall'; pair: WordPair }
  | { kind: 'written'; pair: WordPair };

/**
 * Så många svar ett pass är.
 *
 * Passet ska ta några minuter och sluta medan det fortfarande är roligt. Att
 * det räknas i *svar* och inte i ord är för att ett ord kan komma flera gånger,
 * och det är meningen.
 *
 * ANTAGANDE: satt på känsla. Se docs/plan.md.
 */
export const SESSION_LENGTH = 20;

/**
 * Så många par en match-runda visar.
 *
 * Färre blir ingen övning, fler blir en vägg av ord på en telefon.
 *
 * ANTAGANDE: satt på känsla. Se docs/plan.md.
 */
export const MATCH_ROUND = 5;

/**
 * Ett besvarat kort på väg från en vy till dirigenten.
 *
 * Vyn skickar vad som hände — vilket ord, i vilket steg, rätt eller fel, och
 * hur lång tid det tog. Vad det *betyder* avgör motorn. En vy som räknade ut
 * en tröskel själv vore den första sprickan i treskiktningen.
 */
export interface Answer {
  pair: WordPair;
  step: Step;
  correct: boolean;
  /** Sekunder, eller `null` när svaret inte gick att tajma. */
  seconds: number | null;
}

/** Vad ett pass slutade med. */
export interface SessionSummary {
  answered: number;
  correct: number;
  /** Ord som tog ett steg under passet. */
  advanced: readonly WordPair[];
  /** Ord i blocket som sitter hela vägen ut. */
  automatic: number;
}

export class TrainingSession {
  /** Nycklar på de senast visade orden, nyast sist. Spärren mot upprepning. */
  private readonly recent: string[] = [];
  /** Ord som missades och ska tillbaka innan passet är slut, äldst först. */
  private readonly retry: WordPair[] = [];
  /** Tillståndet varje ord hade när passet började, för att kunna se rörelsen. */
  private readonly before = new Map<string, WordState>();

  private answers = 0;
  private hits = 0;

  constructor(
    private readonly engine: TrainingEngine,
    readonly block: WordBlock,
    /**
     * Var passet kliver in. Ett golv, inte ett läge: det gäller det första
     * kortet, och varje kort efter det avgörs av mätningen. Se `draw()`.
     */
    private readonly entry: Step = STEPS[0],
    private readonly random: Random = Math.random,
  ) {
    for (const pair of block.words) {
      this.before.set(wordKey(pair), engine.stateFor(pair));
    }
  }

  get answered(): number {
    return this.answers;
  }

  get correct(): number {
    return this.hits;
  }

  get target(): number {
    return SESSION_LENGTH;
  }

  /** Om det finns något kvar att öva i blocket över huvud taget. */
  get blockComplete(): boolean {
    return this.block.words.every((pair) => this.engine.stepFor(pair) === null);
  }

  get done(): boolean {
    return this.answers >= SESSION_LENGTH || this.blockComplete;
  }

  /**
   * Nästa uppgift, eller `null` när passet är slut.
   *
   * Ett missat ord går före urvalet, men inte omedelbart: spärren mot
   * upprepning gäller även det, så ordet kommer tillbaka efter några andra ord.
   * Att svara på samma glosa två gånger i rad mäter korttidsminnet och inte
   * glosan.
   */
  nextTask(): Task | null {
    if (this.done) {
      return null;
    }
    const exposure = this.draw();
    if (exposure === null) {
      return null;
    }

    const { pair, step } = exposure;
    if (step === 'match') {
      const pairs = companionsFor(
        pair,
        this.block.words,
        (word) => this.engine.recordFor(word),
        MATCH_ROUND,
        this.random,
      );
      return { kind: 'match', pairs: shuffle(pairs, this.random) };
    }
    if (step === 'trueFalse') {
      return { kind: 'trueFalse', statement: statementFor(pair, this.block.words, this.random) };
    }
    return step === 'recall' ? { kind: 'recall', pair } : { kind: 'written', pair };
  }

  /**
   * Ett besvarat kort. Går vidare till motorn, som äger vad det betyder.
   *
   * `seconds` är `null` när svaret inte gick att tajma — ett tappat kort, ett
   * återupptaget pass. Motorn vet vad den ska göra med det; den här filen ska
   * inte veta.
   */
  record(pair: WordPair, step: Step, correct: boolean, seconds: number | null): void {
    this.engine.record(pair, step, correct, seconds);
    this.answers++;
    if (correct) {
      this.hits++;
    }
    this.remember(pair);

    const key = wordKey(pair);
    const queued = this.retry.some((word) => wordKey(word) === key);
    if (!correct && !queued) {
      this.retry.push(pair);
    }
  }

  summary(): SessionSummary {
    const advanced = this.block.words.filter((pair) => {
      const before = this.before.get(wordKey(pair)) ?? 'UNSEEN';
      return rank(this.engine.stateFor(pair)) > rank(before);
    });
    return {
      answered: this.answers,
      correct: this.hits,
      advanced,
      automatic: this.block.words.filter((pair) => this.engine.stepFor(pair) === null).length,
    };
  }

  private draw(): { pair: WordPair; step: Step } | null {
    const blocked = new Set(this.recent.slice(-RECENT_MEMORY));
    const waiting = this.retry.findIndex((pair) => !blocked.has(wordKey(pair)));
    if (waiting >= 0) {
      const pair = this.retry.splice(waiting, 1)[0];
      const step = trainingStep(this.engine.recordFor(pair), this.entry);
      if (step !== null) {
        return { pair, step };
      }
    }
    return selectNext(
      this.block.words,
      (pair) => this.engine.recordFor(pair),
      this.recent,
      this.random,
      this.entry,
    );
  }

  private remember(pair: WordPair): void {
    this.recent.push(wordKey(pair));
    if (this.recent.length > RECENT_MEMORY * 2) {
      this.recent.splice(0, this.recent.length - RECENT_MEMORY * 2);
    }
  }
}

/** Hur långt ett tillstånd ligger fram. Bara till för att se rörelse. */
function rank(state: WordState): number {
  if (state === 'UNSEEN') {
    return -1;
  }
  if (state === 'AUTOMATIC') {
    return STEPS.length;
  }
  const steps: Record<Exclude<WordState, 'UNSEEN' | 'AUTOMATIC'>, Step> = {
    MATCH: 'match',
    TRUE_FALSE: 'trueFalse',
    RECALL: 'recall',
    WRITTEN: 'written',
  };
  return STEPS.indexOf(steps[state]);
}
