/**
 * Kortet som svepas: steg två och steg tre på samma komponent.
 *
 * Sant/falskt visar ett påstående — `dog = hund` — och den som övar svarar
 * rätt eller fel. Återkalla visar bara ordet, låter tanken göra jobbet, visar
 * facit och frågar om det stämde. Två steg, men samma kort, samma gest och
 * samma återkoppling; det enda som skiljer är vem som är domare och vad tiden
 * mäter.
 *
 * **Facit visas när fingret rör kortet**, och det är svaret på öppen fråga 5 i
 * docs/plan.md. En fast paus straffar den snabba och stressar den långsamma, och
 * en extra knapp gör steget till två interaktioner i stället för en. Rör sig
 * fingret har återkallningen redan hänt, och det är den tiden som mäts.
 *
 * **Gesten är `ganger`:s, tagen rakt av.** Kortet är ett föremål på ett bord:
 * det lutar med draget, stämplas med det svar draget är på väg att ge, och far
 * ut ur bild åt det hållet. Dragningen sköts av CDK precis som där — det är
 * samma gest, och den ska inte vara skriven två gånger på två sätt.
 *
 * När en dragning är ett svar och inte en darrning avgörs av `swipe-gesture.ts`
 * och inte här: det är en regel, och regler i den här appen ska gå att pröva
 * utan en skärm.
 *
 * Det enda som skiljer mot `ganger` är vad som står på kortet. Domen under det
 * lever kvar över kortbytet, eftersom rättelsen — `dog = hund` — ska hinna
 * läsas medan nästa kort redan ligger framme.
 */
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  ViewChild,
  inject,
} from '@angular/core';
import { CdkDrag, CdkDragEnd, CdkDragMove } from '@angular/cdk/drag-drop';
import { DragSample, commitsSwipe, swipeProgress } from './swipe-gesture';
import { Statement } from '../words/distractors';
import { WordPair } from '../words/word-catalog';
import { Answer } from '../training/session';

export type SwipeCard =
  | { kind: 'trueFalse'; statement: Statement }
  | { kind: 'recall'; pair: WordPair };

/** Hur länge kortet flyger ut innan nästa läggs fram. */
const LEAVE_MS = 260;

/** Hur länge domen står kvar. Ett rätt kvitteras; ett fel ska hinna läsas. */
const VERDICT_CORRECT_MS = 900;
const VERDICT_WRONG_MS = 1800;

/** Domen under kortet. Lever kvar när nästa kort lagts fram. */
interface Verdict {
  correct: boolean;
  text: string;
}

@Component({
  selector: 'app-swipe-view',
  templateUrl: 'swipe-view.component.html',
  styleUrl: 'swipe-view.component.scss',
  imports: [CdkDrag],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SwipeViewComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) card!: SwipeCard;

  /** Ett besvarat kort, att lagra. Skickas i samma stund domen faller. */
  @Output() readonly answered = new EventEmitter<Answer>();
  /** Klart här — ge nästa uppgift. Kommer när kortet lämnat bordet. */
  @Output() readonly completed = new EventEmitter<void>();

  @ViewChild(CdkDrag) private drag?: CdkDrag;

  /** `asking` för frågan, `revealed` när facit ligger uppe i återkalla. */
  phase: 'asking' | 'revealed' = 'asking';

  /** -1 helt åt vänster, 0 i vila, +1 helt åt höger. Driver all dragrespons. */
  progress = 0;
  /** Riktningen kortet flyger ut åt, 0 när det ligger stilla. */
  leaving: -1 | 0 | 1 = 0;
  /** Stänger av övergångar i det ögonblick nästa kort läggs på plats. */
  instant = false;
  /** Domen över förra svaret, eller `undefined` när raden är tyst. */
  verdict: Verdict | undefined;

  private readonly changes = inject(ChangeDetectorRef);
  private startedAt = Date.now();
  private recallSeconds: number | null = null;
  /** De senaste punkterna under dragningen, för att kunna mäta farten. */
  private samples: DragSample[] = [];
  private advanceTimer: ReturnType<typeof setTimeout> | null = null;
  private verdictTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Nytt kort på bordet.
   *
   * Domen nollställs med flit *inte* här: den hör till kortet som just for ut,
   * och ska stå kvar tills dess egen klocka gått ut.
   */
  ngOnChanges(): void {
    this.clear(this.advanceTimer);
    this.advanceTimer = null;
    this.phase = 'asking';
    this.progress = 0;
    this.leaving = 0;
    this.samples = [];
    this.recallSeconds = null;
    this.startedAt = Date.now();
    // Utan detta skulle kortet animeras in från kanten det förra for ut åt.
    this.instant = true;
    this.drag?.reset();
    requestAnimationFrame(() => {
      this.instant = false;
      this.changes.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.clear(this.advanceTimer);
    this.clear(this.verdictTimer);
  }

  /** Sant medan kortet flyger ut — då tas inga nya svar emot. */
  get locked(): boolean {
    return this.leaving !== 0;
  }

  /** Återkalla innan facit visats: tanken ska göra sitt jobb först. */
  get thinking(): boolean {
    return this.card.kind === 'recall' && this.phase === 'asking';
  }

  get rotation(): number {
    return this.progress * 12;
  }

  /** 0 när kortet ligger stilla, 1 när det dragits hela vägen åt `dir`. */
  strength(dir: 1 | -1): number {
    return Math.max(0, dir * this.progress);
  }

  /** Ordet som frågas efter — engelskan, i båda stegen. */
  get prompt(): string {
    return this.pair.en;
  }

  /** Det som står under ordet: påståendets översättning, eller facit. */
  get shown(): string {
    return this.card.kind === 'trueFalse' ? this.card.statement.shown : this.pair.sv;
  }

  get pair(): WordPair {
    return this.card.kind === 'trueFalse' ? this.card.statement.pair : this.card.pair;
  }

  /** Vad knapparna heter. I återkalla är det den som övar som dömer sig själv. */
  get affirmLabel(): string {
    return this.card.kind === 'trueFalse' ? 'Rätt' : 'Jag kunde det';
  }

  get denyLabel(): string {
    return this.card.kind === 'trueFalse' ? 'Fel' : 'Jag kunde inte';
  }

  /** Stämplarna är knapparnas ord i kortformat — de ska rymmas på kortet. */
  get affirmStamp(): string {
    return this.card.kind === 'trueFalse' ? 'RÄTT' : 'KUNDE';
  }

  get denyStamp(): string {
    return this.card.kind === 'trueFalse' ? 'FEL' : 'KUNDE INTE';
  }

  /** Om facit ska stå på kortet just nu. */
  get showsAnswer(): boolean {
    return this.card.kind === 'trueFalse' || this.phase !== 'asking';
  }

  // --- Dragning -------------------------------------------------------------

  dragMoved($event: CdkDragMove): void {
    // Rotationen ska följa hur långt kortet flyttats, inte var på skärmen
    // fingret råkar befinna sig.
    this.progress = swipeProgress($event.distance.x, window.innerWidth);

    this.samples.push({ x: $event.distance.x, t: performance.now() });
    if (this.samples.length > 5) {
      this.samples.shift();
    }
  }

  dragEnd($event: CdkDragEnd): void {
    const dx = $event.distance.x;
    const committed = commitsSwipe(dx, this.samples, window.innerWidth);
    this.samples = [];

    if (committed) {
      this.answer(dx > 0);
    } else {
      this.progress = 0;
      this.drag?.reset();
    }
  }

  /** Fingret på kortet i återkalla: tanken har redan hunnit. Facit fram. */
  onPointerDown(): void {
    this.reveal();
  }

  /** Tangentbordet: vänster är nej, höger är ja, mellanslag visar facit. */
  onKey(event: KeyboardEvent): void {
    if (this.locked) {
      return;
    }
    if (event.key === 'ArrowRight') {
      this.answer(true);
    } else if (event.key === 'ArrowLeft') {
      this.answer(false);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.reveal();
    }
  }

  /** Svaret, oavsett om det kom som ett svep, en tangent eller en knapp. */
  answer(affirm: boolean): void {
    if (this.locked) {
      return;
    }
    if (this.thinking) {
      // Ett svar innan facit visats är ändå ett svar: tiden är den som gått.
      this.reveal();
    }

    const seconds = this.secondsFor();
    const correct =
      this.card.kind === 'trueFalse' ? affirm === this.card.statement.truthy : affirm;

    if (!correct) {
      this.buzz();
    }
    this.answered.emit({
      pair: this.pair,
      step: this.card.kind === 'trueFalse' ? 'trueFalse' : 'recall',
      correct,
      seconds,
    });
    this.showVerdict(correct);

    this.leaving = affirm ? 1 : -1;
    this.progress = affirm ? 1 : -1;
    this.clear(this.advanceTimer);
    this.advanceTimer = setTimeout(() => {
      this.advanceTimer = null;
      this.completed.emit();
      this.changes.markForCheck();
    }, LEAVE_MS);
  }

  /** Knappen för den som hellre trycker än rör kortet. */
  showAnswer(): void {
    this.reveal();
  }

  /**
   * Domen under kortet.
   *
   * Ett fel står kvar längre än ett rätt: rättelsen är det enda på skärmen som
   * bär ny kunskap, och den ska hinna läsas medan nästa kort redan ligger
   * framme.
   */
  private showVerdict(correct: boolean): void {
    const { en, sv } = this.pair;
    this.verdict = {
      correct,
      text: correct
        ? 'Rätt!'
        : this.card.kind === 'trueFalse'
          ? `Nej — ${en} = ${sv}`
          : `${en} = ${sv}`,
    };
    this.clear(this.verdictTimer);
    this.verdictTimer = setTimeout(
      () => {
        this.verdictTimer = null;
        this.verdict = undefined;
        this.changes.markForCheck();
      },
      correct ? VERDICT_CORRECT_MS : VERDICT_WRONG_MS,
    );
  }

  /** Visar facit i återkalla och stannar klockan. Sant om något hände. */
  private reveal(): boolean {
    if (!this.thinking) {
      return false;
    }
    this.recallSeconds = (Date.now() - this.startedAt) / 1000;
    this.phase = 'revealed';
    return true;
  }

  /**
   * Tiden som lagras.
   *
   * I återkalla är det tiden fram till facit — det är då minnet gjorde sitt
   * arbete. Tiden det tar att därefter trycka på «jag kunde det» säger bara
   * något om tummen.
   */
  private secondsFor(): number | null {
    if (this.card.kind === 'recall') {
      return this.recallSeconds;
    }
    return (Date.now() - this.startedAt) / 1000;
  }

  private buzz(): void {
    if ('vibrate' in navigator) {
      navigator.vibrate(60);
    }
  }

  private clear(timer: ReturnType<typeof setTimeout> | null): void {
    if (timer !== null) {
      clearTimeout(timer);
    }
  }
}
