/**
 * Vad appen tror om den som övar, och vad den gör med det.
 *
 * Mellanlagret i `vy → TrainingEngine → ProgressRepository`. En vy frågar
 * motorn — *vilket steg ska det här ordet övas i*, *var det svaret snabbt*,
 * *hur mycket behöver ordet nötas* — och räknar aldrig ut en tröskel själv.
 *
 * Motorn äger i sin tur inga rena regler. De ligger i `word-state.ts`, där de
 * går att pröva utan en spelare. Det motorn äger är tillståndet: det hydrerade
 * dokumentet, när det skrivs, och omräkningen från sekunder till kvot.
 */
import { Injectable } from '@angular/core';
import { WordPair, wordKey } from '../words/word-catalog';
import {
  LocalStorageProgressRepository,
  MAX_SAMPLES,
  ProgressDocument,
  ProgressRepository,
  BASELINE_WINDOW,
  baselineFor,
  emptyDocument,
  hasContent,
} from '../services/progress-store';
import {
  Step,
  WordRecord,
  WordState,
  emptyRecord,
  hasReached,
  masteryIn,
  needFor,
  recordAttempt,
  stateFor,
  trainingStep,
} from './word-state';

/** Hur länge skrivningar får samlas på hög. Varje skrivning serialiserar hela
 *  dokumentet, och ett block på tjugo ord ger många kort. */
const WRITE_DELAY = 1000;

/** Mätningar utanför det här spannet säger mer om ett tappat kort än om
 *  spelarens fart, och ska inte få dra baslinjen med sig. */
const MIN_SAMPLE = 0.3;
const MAX_SAMPLE = 20;

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

  /** Vad appen vet om en glosa. Ett tomt kort för ett ord som aldrig setts. */
  recordFor(pair: WordPair): WordRecord {
    return this.document.words[wordKey(pair)] ?? emptyRecord();
  }

  /** Etiketten som visas — härledd ur måtten, aldrig läst ur ett fält. */
  stateFor(pair: WordPair): WordState {
    return stateFor(this.recordFor(pair));
  }

  /** Steget ordet ska visas i nu, stödsteget inräknat. `null` = automatiserat. */
  stepFor(pair: WordPair): Step | null {
    return trainingStep(this.recordFor(pair));
  }

  /** Hur mycket ordet behöver övas i ett steg. Vikt i urvalet, inte en poäng. */
  needFor(pair: WordPair, step: Step): number {
    return needFor(this.recordFor(pair), step);
  }

  /** Stegets baslinje i sekunder. Det enda stället som vet vad "snabbt" är. */
  baselineFor(step: Step): number {
    return baselineFor(this.document, step);
  }

  /**
   * Ett besvarat kort.
   *
   * Tiden kommer in som sekunder och lagras som *kvot mot stegets baslinje*.
   * Det är den viktigaste raden i filen: lagras sekunder i ett delat fält blir
   * måttet obrukbart så snart två steg skriver till det, eftersom ett svep och
   * ett skrivet svar ligger på olika tidsskalor. En kvot betyder samma sak i
   * alla fyra stegen.
   */
  record(pair: WordPair, step: Step, correct: boolean, seconds: number | null): void {
    const key = wordKey(pair);
    const record = this.document.words[key] ?? emptyRecord();
    const usable = seconds !== null && seconds >= MIN_SAMPLE && seconds <= MAX_SAMPLE;
    const pace = usable ? seconds / this.baselineFor(step) : null;

    this.document.words[key] = {
      ...record,
      [step]: recordAttempt(record[step], { correct, pace, at: Date.now() }),
    };

    // Baslinjen mäts bara på rätta svar. Ett fel är ofta ett långt grubbel
    // eller ett tappat kort, och att låta det höja baslinjen vore att låta
    // tröskeln sjunka varje gång det går dåligt.
    if (usable && correct) {
      const samples = this.document.baselines[step];
      this.document.baselines[step] = [...samples, seconds].slice(-BASELINE_WINDOW);
    }
    this.scheduleWrite();
  }

  /** Blocket som övas, så att en session kan tas upp där den lämnades. */
  get activeBlockId(): string | null {
    return this.document.activeBlockId;
  }

  setActiveBlock(id: string | null): void {
    this.document.activeBlockId = id;
    this.scheduleWrite();
  }

  /** Hur många ord i blocket som sitter i ett givet steg. */
  masteredCount(words: readonly WordPair[], step: Step): number {
    return words.filter((pair) => masteryIn(this.recordFor(pair)[step]) === 'mastered').length;
  }

  /**
   * Om något ord i blocket tagit sig fram till steget. Det som låser upp en
   * ingång på startsidan.
   *
   * Avsiktligt *ett* ord och inte alla: ingången är ett golv, och ett golv som
   * kräver att alla redan står på det är inget golv.
   */
  reached(words: readonly WordPair[], step: Step): boolean {
    return words.some((pair) => hasReached(this.recordFor(pair), step));
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

/** Så många mätningar ett steg sparar per ord. Återexporterad för vyerna. */
export { MAX_SAMPLES };
