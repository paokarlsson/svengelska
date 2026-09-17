/**
 * Varvsdirigenten: det som gör en hög kort till ett varv.
 *
 * Den håller varvets ordning, lämnar ifrån sig en *uppgift* — inte en vy — och
 * tar emot vad som hände. Vad det betyder avgör motorn; vilka ord varvet består
 * av avgör `round.ts`; vad ett svar gör med planen avgör `word-state.ts`. Det
 * dirigenten äger är varvets eget minne: vad som står kvar, vad som missades
 * och ska tillbaka, och när det är slut.
 *
 * Skillnaden mot passet som fanns före grenen är att varvet är *bestämt i
 * förväg*. Ett pass drog nästa ord ur en viktad fördelning tills tjugo svar var
 * givna; ett varv är tio ord åt båda hållen, och de tjugo korten är kända innan
 * det första visas. Det är vad som gör «tio ord åt båda hållen» till ett löfte
 * i stället för en förhoppning, och det är också vad som låter en
 * repetitionsplan ta över urvalet: en plan som drar ett ord i taget är ingen
 * plan.
 */
import { Channel } from '../services/progress-store';
import { Statement, statementFor, statementWith } from '../words/distractors';
import { Random, pick } from '../words/shuffle';
import { DirectedWord, WordPair, pairKey, wordKey } from '../words/word-catalog';
import { CALIBRATION_CARDS, CalibrationCard, EASY_WORDS, calibrationCards } from './calibration';
import { ROUND_WORDS, pickRoundWords, roundCards } from './round';
import { TrainingEngine } from './training-engine';
import { Outcome, Response, isCorrect } from './word-state';

/**
 * En uppgift på skärmen.
 *
 * `calibration` är kanalen provet mäter, och `null` för ett kort som räknas.
 * Att de två går genom samma fält och inte genom två sorters uppgift är
 * medvetet: för den som övar är de samma kort med samma gest, och skulle de bli
 * två typer i koden blir de förr eller senare två kort på skärmen.
 */
export interface Task {
  statement: Statement;
  calibration: Channel | null;
}

/** Vad ett varv slutade med. */
export interface RoundSummary {
  /** Kort som räknades. Kalibreringen ingår inte. */
  answered: number;
  hits: number;
  slow: number;
  misses: number;
  unsure: number;
  /** Ord varvet innehöll. Färre än tio betyder att det inte fanns fler. */
  words: number;
  /** Håll som flyttade upp en låda i planen. */
  advanced: readonly DirectedWord[];
  /** Ord som sitter åt båda hållen. */
  mastered: number;
}

/**
 * Så många gånger ett kastat kalibreringsprov får ersättas.
 *
 * Ett tak, eftersom den som svepar «vet ej» på allt annars aldrig kommer förbi
 * kalibreringen. Går provet inte att mäta lämnas kanalen omätt och golvet blir
 * grundvärdet — det är ett sämre golv, men ett varv som aldrig börjar är sämre
 * än så.
 */
const MAX_REPLACEMENTS = 4;

export class TrainingSession {
  private readonly calibration: CalibrationCard[];
  private readonly cards: DirectedWord[];
  private readonly retry: DirectedWord[] = [];
  /**
   * Kort som redan fått sin andra chans.
   *
   * Utan taket tar varvet aldrig slut för den som svarar «vet ej» på allt: kön
   * lägger tillbaka kortet, det besvaras likadant, och det läggs tillbaka igen.
   * En andra chans är en andra chans — en tredje är en loop.
   */
  private readonly retried = new Set<string>();
  private readonly easy: readonly WordPair[];
  /** Lådan varje håll stod i när varvet började, för att kunna se rörelsen. */
  private readonly before = new Map<string, number>();
  /** Varvets kort uppslagna på nyckel. Köerna töms; den här gör det inte. */
  private readonly lookup = new Map<string, DirectedWord>();

  /** Kort varvet lovade. Ett fält och ingen längd: köerna töms medan de spelas. */
  private readonly size: number;

  private answers = 0;
  private replacements = 0;
  /** Nyckeln på kortet som just besvarades, för spärren mot upprepning. */
  private last: string | null = null;
  private readonly tally: Record<Outcome, number> = { hit: 0, slow: 0, miss: 0, unsure: 0 };

  constructor(
    private readonly engine: TrainingEngine,
    /** Hela katalogen. Repetitionen tar allt som setts, oavsett vecka. */
    private readonly catalog: readonly WordPair[],
    /** Listan nya ord hämtas ur. */
    fresh: readonly WordPair[],
    private readonly random: Random = Math.random,
    now: number = Date.now(),
  ) {
    const words = pickRoundWords(
      catalog,
      fresh,
      (word) => engine.statFor(word),
      now,
      engine.newWordsLeft(catalog, now),
    );
    this.cards = roundCards(words, random);
    this.size = this.cards.length;
    this.easy = engine.masteredWords(catalog);
    // Ett tomt varv kalibreras inte. Golvet är ett instrument för att mäta
    // korten som kommer, och kommer inga kort finns ingenting att mäta.
    this.calibration = this.size === 0 ? [] : calibrationCards(this.easy, random);

    for (const card of this.cards) {
      const key = keyOf(card);
      this.before.set(key, engine.statFor(card).box);
      this.lookup.set(key, card);
    }
  }

  get answered(): number {
    return this.answers;
  }

  /** Så många kort varvet lovar. Missar som kommer tillbaka ingår inte. */
  get target(): number {
    return this.size;
  }

  /** Ord i varvet. Noll betyder att ingenting var moget och inget nytt fanns. */
  get words(): number {
    return this.size / 2;
  }

  /** Om varvet blev kortare än det ska vara — då finns inte mer att öva nu. */
  get short(): boolean {
    return this.words < ROUND_WORDS;
  }

  get done(): boolean {
    return (
      this.calibration.length === 0 && this.cards.length === 0 && this.retry.length === 0
    );
  }

  /** Nästa uppgift, eller `null` när varvet är slut. */
  nextTask(): Task | null {
    const probe = this.calibration[0];
    if (probe !== undefined) {
      return {
        statement: statementWith(
          probe.word.pair,
          probe.word.direction,
          this.pool(probe.word.pair),
          probe.truthy,
          this.random,
        ),
        calibration: probe.channel,
      };
    }

    const next = this.cards[0] ?? this.pickRetry();
    if (next === undefined) {
      return null;
    }
    return {
      statement: statementFor(next.pair, next.direction, this.catalog, this.random),
      calibration: null,
    };
  }

  /**
   * Ett besvarat kort.
   *
   * Kalibreringen och varvet skiljs åt här och ingen annanstans: ett prov går
   * till kanalens golv och lämnar varken dom eller låda efter sig, medan ett
   * kort som räknas går hela vägen genom motorn.
   */
  record(task: Task, response: Response, seconds: number | null): void {
    if (task.calibration !== null) {
      this.recordProbe(task.calibration, response, seconds);
      return;
    }

    const outcome = this.engine.record(task.statement, response, seconds);
    this.tally[outcome]++;
    this.answers++;

    const word: DirectedWord = {
      pair: task.statement.pair,
      direction: task.statement.direction,
    };
    this.take(word);
    this.last = pairKey(word.pair);
    if (!isCorrect(outcome)) {
      this.queueRetry(word);
    }
  }

  summary(): RoundSummary {
    const advanced = [...this.before.entries()]
      .filter(([key, box]) => this.boxNow(key) > box)
      .map(([key]) => this.wordFor(key))
      .filter((word): word is DirectedWord => word !== null);

    return {
      answered: this.answers,
      hits: this.tally.hit,
      slow: this.tally.slow,
      misses: this.tally.miss,
      unsure: this.tally.unsure,
      words: this.words,
      advanced,
      mastered: this.engine.masteredCount(this.catalog),
    };
  }

  /**
   * Ett kalibreringsprov.
   *
   * Ett «vet ej» betyder att det lätta ordet inte var lätt, och då är mätningen
   * värdelös: golvet ska vara tiden för ett ord man kan, och det här var inte
   * ett. Provet kastas och ett nytt kort dras — utan den regeln kan ett enda
   * glömt ord sänka golvet för hela varvet, och då bedöms varje efterföljande
   * ord orättvist som snabbt.
   */
  private recordProbe(channel: Channel, response: Response, seconds: number | null): void {
    const probe = this.calibration.shift();
    if (probe === undefined) {
      return;
    }
    if (response !== 'unsure') {
      this.engine.calibrate(channel, seconds);
      return;
    }
    if (this.replacements >= MAX_REPLACEMENTS) {
      return;
    }
    this.replacements++;
    const replacement = this.freshProbe(probe);
    if (replacement !== null) {
      this.calibration.unshift(replacement);
    }
  }

  /**
   * Ett nytt prov i samma kanal, på ett annat ord än det som kastades.
   *
   * Kanalen står fast och bara ordet byts: det är kanalen som ska mätas, och
   * ett prov som bytte kanal vore ett prov som mätte fel golv.
   */
  private freshProbe(discarded: CalibrationCard): CalibrationCard | null {
    const pool = this.easy.length >= CALIBRATION_CARDS ? this.easy : EASY_WORDS;
    const candidates = pool.filter(
      (pair) => pairKey(pair) !== pairKey(discarded.word.pair),
    );
    const pair = pick(candidates, this.random);
    return pair === null ? null : { ...discarded, word: { ...discarded.word, pair } };
  }

  /** Tar kortet ur den kö det stod i. */
  private take(word: DirectedWord): void {
    const key = keyOf(word);
    const index = this.cards.findIndex((card) => keyOf(card) === key);
    if (index >= 0) {
      this.cards.splice(index, 1);
      return;
    }
    const waiting = this.retry.findIndex((card) => keyOf(card) === key);
    if (waiting >= 0) {
      this.retry.splice(waiting, 1);
    }
  }

  /**
   * Ett kort som gick fel — eller fick «vet ej» — kommer tillbaka *efter* de
   * tjugo, inte i stället för ett av dem.
   *
   * Varvet ska täcka varje ord åt båda hållen minst en gång, och ett varv som
   * kortas av sina egna misstag täcker minst där det behövs mest. Att ordet
   * ändå kommer igen inom varvet är hela skälet till att kön finns.
   */
  private queueRetry(word: DirectedWord): void {
    const key = keyOf(word);
    if (this.retried.has(key) || this.retry.some((card) => keyOf(card) === key)) {
      return;
    }
    this.retried.add(key);
    this.retry.push(word);
  }

  /**
   * Nästa kort ur återkomstkön, med samma spärr som varvet självt har.
   *
   * Ligger `dog = hund` direkt efter `hund = dog` mäts korttidsminnet och inte
   * glosan, och det gäller lika mycket för ett kort som kommer tillbaka som för
   * ett som kommer första gången. Finns inget annat att ta får ordet komma
   * ändå: ett varv som vägrar avsluta är sämre än ett upprepat kort.
   */
  private pickRetry(): DirectedWord | undefined {
    const fresh = this.retry.find((card) => pairKey(card.pair) !== this.last);
    return fresh ?? this.retry[0];
  }

  /** Blocket ett kalibreringsord hämtar sina felsvar ur. */
  private pool(pair: WordPair): readonly WordPair[] {
    return this.catalog.some((other) => pairKey(other) === pairKey(pair))
      ? this.catalog
      : [pair, ...this.catalog];
  }

  private boxNow(key: string): number {
    const word = this.wordFor(key);
    return word === null ? 0 : this.engine.statFor(word).box;
  }

  private wordFor(key: string): DirectedWord | null {
    return this.lookup.get(key) ?? null;
  }
}

function keyOf(word: DirectedWord): string {
  return wordKey(word.pair, word.direction);
}
