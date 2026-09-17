/**
 * Vad appen tror om den som övar, och vad den gör med det.
 *
 * Mellanlagret i `vy → TrainingEngine → ProgressRepository`. En vy skickar vad
 * som *hände* — vilket påstående, vilken gest, hur lång tid det tog — och får
 * aldrig avgöra vad det betyder. Att svepet skickar `affirm` och inte `correct`
 * är hela den regeln i en rad: om kortet var sant, om svaret var i tempo och
 * vilken låda ordet hamnar i är motorns sak.
 *
 * Motorn äger i sin tur inga rena regler. De ligger i `word-state.ts` och
 * `schedule.ts`, där de går att pröva utan en spelare. Det motorn äger är
 * tillståndet: det hydrerade dokumentet, när det skrivs, och omräkningen från
 * sekunder till kvot.
 */
import { Injectable } from '@angular/core';
import { Statement } from '../words/distractors';
import { DirectedWord, WordPair, wordKey } from '../words/word-catalog';
import {
  Channel,
  LocalStorageProgressRepository,
  MAX_NEW_PER_DAY,
  MAX_SAMPLES,
  ProgressDocument,
  ProgressRepository,
  BASELINE_WINDOW,
  Settings,
  baselineFor,
  channelFor,
  emptyDocument,
  hasContent,
} from '../services/progress-store';
import { sameDay } from './schedule';
import {
  MASTERED_PACE,
  Outcome,
  Response,
  Step,
  StepStat,
  WordRecord,
  WordState,
  emptyRecord,
  emptyStat,
  isCorrect,
  masteryIn,
  needFor,
  recordAttempt,
  stateFor,
  trainingStep,
} from './word-state';

/** Hur länge skrivningar får samlas på hög. Varje skrivning serialiserar hela
 *  dokumentet, och ett varv på tjugo kort ger många. */
const WRITE_DELAY = 1000;

/** Mätningar utanför det här spannet säger mer om ett tappat kort än om
 *  spelarens fart, och ska inte få dra baslinjen med sig. */
const MIN_SAMPLE = 0.3;
const MAX_SAMPLE = 20;

/** Steget grenen spelar. Allt motorn mäter mäts i det. */
const STEP: Step = 'trueFalse';

@Injectable({ providedIn: 'root' })
export class TrainingEngine {
  private document: ProgressDocument = emptyDocument();
  private writeTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Lagret. Ett fält och inte en konstruktorparameter, eftersom
   * `ProgressRepository` är ett gränssnitt och ett gränssnitt inte kan vara en
   * injektionspollett. Testerna pekar om det med `useRepository()` innan
   * `hydrate()`.
   */
  private repository: ProgressRepository = new LocalStorageProgressRepository();

  useRepository(repository: ProgressRepository): void {
    this.repository = repository;
  }

  /**
   * Läses en gång vid uppstart, innan första vyn ritas. Allt efter det läser
   * kopian i minnet: mallarna läser den vid varje ändringsdetektering och kan
   * inte vänta på ett löfte.
   */
  async hydrate(): Promise<void> {
    this.document = await this.repository.load();
  }

  /** Vad appen vet om en glosa åt ett håll. Ett tomt kort för ett osett ord. */
  recordFor(word: DirectedWord): WordRecord {
    return this.document.words[wordKey(word.pair, word.direction)] ?? emptyRecord();
  }

  /** Mätningarna i det steg grenen spelar. Det planen och varvet läser. */
  statFor(word: DirectedWord): StepStat {
    return this.recordFor(word)[STEP] ?? emptyStat();
  }

  /** Etiketten som visas — härledd ur måtten, aldrig läst ur ett fält. */
  stateFor(word: DirectedWord): WordState {
    return stateFor(this.recordFor(word));
  }

  /** Steget ordet ska visas i nu. `null` = klart hela vägen. */
  stepFor(word: DirectedWord): Step | null {
    return trainingStep(this.recordFor(word));
  }

  /** Om hållet sitter. Ett ord sitter när båda hållen gör det. */
  settled(word: DirectedWord): boolean {
    return masteryIn(this.statFor(word)) === 'mastered';
  }

  /** Hur mycket ordet behöver nötas. Vikt i urvalet, inte en poäng. */
  needFor(word: DirectedWord): number {
    return needFor(this.recordFor(word), STEP);
  }

  /** Kanalens baslinje i sekunder. Det enda stället som vet vad «snabbt» är. */
  baselineFor(channel: Channel): number {
    return baselineFor(this.document, channel);
  }

  /**
   * Ett kalibreringskort.
   *
   * Går till kanalens golv och till ingenting annat: ordet får ingen dom, ingen
   * låda och ingen mätning. Det är ett instrument och ingen övning, och att
   * låta det räknas vore att låta mätstickan ligga i samma hög som det den
   * mäter.
   *
   * Ett «vet ej» kommer aldrig hit — se `CalibrationCard` och varvet. Provet
   * kastas i stället, eftersom ett lätt ord som inte var lätt mäter fel sak med
   * rätt precision.
   */
  calibrate(channel: Channel, seconds: number | null): void {
    if (!usableSample(seconds)) {
      return;
    }
    const samples = this.document.baselines[channel];
    this.document.baselines[channel] = [...samples, seconds].slice(-BASELINE_WINDOW);
    this.scheduleWrite();
  }

  /**
   * Ett besvarat kort. Returnerar vad svaret *blev*, för sammanfattningen.
   *
   * Tre beslut ligger på de här raderna, och inget av dem får flytta ut i en vy:
   *
   * **Vad gesten betyder.** `affirm` mot ett falskt påstående är fel; `unsure`
   * är varken rätt eller fel utan en ärlig lucka.
   *
   * **Om svaret var i tempo.** Kvoten mäts mot *kanalens* golv — riktning och
   * sanningsvärde — och inte mot ett gemensamt snitt. Ett rätt som är segare än
   * tröskeln blir `slow`, och en `slow` flyttar inte upp ordet i planen.
   *
   * **Att «vet ej» inte bär någon fart.** Tiden det tar att erkänna en lucka
   * mäter ärlighet och inte framplockning, och den ska inte röra vare sig
   * kanalens golv eller ordets egna mätningar.
   */
  record(statement: Statement, response: Response, seconds: number | null): Outcome {
    const channel = channelFor(statement.direction, statement.truthy);
    const outcome = this.outcomeFor(statement, response, seconds, channel);

    const key = wordKey(statement.pair, statement.direction);
    const record = this.document.words[key] ?? emptyRecord();
    const usable = usableSample(seconds) && outcome !== 'unsure';
    const pace = usable ? seconds / this.baselineFor(channel) : null;

    this.document.words[key] = {
      ...record,
      [STEP]: recordAttempt(record[STEP], { outcome, pace, at: Date.now() }),
    };
    this.scheduleWrite();
    return outcome;
  }

  private outcomeFor(
    statement: Statement,
    response: Response,
    seconds: number | null,
    channel: Channel,
  ): Outcome {
    if (response === 'unsure') {
      return 'unsure';
    }
    if ((response === 'affirm') !== statement.truthy) {
      return 'miss';
    }
    if (!usableSample(seconds)) {
      // Ett otajmat rätt kan inte visas vara segt, och ska då inte antas vara
      // det: tvivlet tillfaller den som svarade.
      return 'hit';
    }
    return seconds / this.baselineFor(channel) > MASTERED_PACE ? 'slow' : 'hit';
  }

  /** Listan nya ord hämtas ur, så att nästa besök kan peka ut var man var. */
  get activeBlockId(): string | null {
    return this.document.activeBlockId;
  }

  setActiveBlock(id: string | null): void {
    this.document.activeBlockId = id;
    this.scheduleWrite();
  }

  get settings(): Settings {
    return this.document.settings;
  }

  setNewWordsPerDay(count: number): void {
    const whole = Number.isFinite(count) ? Math.round(count) : 0;
    this.document.settings = {
      ...this.document.settings,
      newWordsPerDay: Math.min(MAX_NEW_PER_DAY, Math.max(0, whole)),
    };
    this.scheduleWrite();
  }

  /**
   * Hur många nya ord dagen redan tagit.
   *
   * Härlett ur `firstSeen` och inte ur en räknare. En räknare som nollas vid
   * midnatt är ett fält som kan glida isär från verkligheten — den som övar
   * över ett midnattsslag, den som byter tidszon — medan ett fält som skrivs en
   * gång per ord inte kan det.
   *
   * Räknat i *ord* och inte i kort: en glosa som introducerades åt båda hållen
   * i samma varv är ett nytt ord och inte två.
   */
  newWordsToday(catalog: readonly WordPair[], now: number = Date.now()): number {
    return catalog.filter((pair) =>
      (['en', 'sv'] as const).some((direction) => {
        const first = this.statFor({ pair, direction }).firstSeen;
        return first !== null && sameDay(first, now);
      }),
    ).length;
  }

  /** Vad som återstår av dagens budget. Aldrig negativt. */
  newWordsLeft(catalog: readonly WordPair[], now: number = Date.now()): number {
    return Math.max(0, this.settings.newWordsPerDay - this.newWordsToday(catalog, now));
  }

  /**
   * Orden appen *vet* är lätta för just den här spelaren: de som sitter åt båda
   * hållen. Kalibreringens förstahandsval.
   */
  masteredWords(catalog: readonly WordPair[]): WordPair[] {
    return catalog.filter((pair) =>
      (['en', 'sv'] as const).every((direction) => this.settled({ pair, direction })),
    );
  }

  /** Hur många ord i listan som sitter åt båda hållen. */
  masteredCount(words: readonly WordPair[]): number {
    return this.masteredWords(words).length;
  }

  /** Om det finns något alls att visa — en karta över ett tomt block ljuger. */
  get hasPractice(): boolean {
    return hasContent(this.document);
  }

  async reset(): Promise<void> {
    this.cancelWrite();
    this.document = emptyDocument();
    await this.repository.clear();
  }

  /** Skriver nu i stället för att vänta ut fördröjningen. */
  async flush(): Promise<void> {
    if (this.writeTimer === null) {
      return;
    }
    this.cancelWrite();
    await this.repository.save(this.document);
  }

  private scheduleWrite(): void {
    if (this.writeTimer !== null) {
      return;
    }
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      void this.repository.save(this.document);
    }, WRITE_DELAY);
  }

  private cancelWrite(): void {
    if (this.writeTimer !== null) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
  }
}

/** Om mätningen alls säger något om spelarens fart. */
function usableSample(seconds: number | null): seconds is number {
  return seconds !== null && seconds >= MIN_SAMPLE && seconds <= MAX_SAMPLE;
}

export { MAX_SAMPLES, isCorrect };
