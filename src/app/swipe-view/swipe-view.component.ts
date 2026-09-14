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
  inject,
} from '@angular/core';
import { Statement } from '../words/distractors';
import { WordPair } from '../words/word-catalog';
import { Answer } from '../training/session';

export type SwipeCard =
  | { kind: 'trueFalse'; statement: Statement }
  | { kind: 'recall'; pair: WordPair };

/** Så långt kortet måste dras för att räknas som ett svep och inte en darrning. */
const SWIPE_THRESHOLD = 70;

/** Hur länge återkopplingen står kvar innan nästa kort. */
const FEEDBACK_MS = 900;

@Component({
  selector: 'app-swipe-view',
  templateUrl: 'swipe-view.component.html',
  styleUrl: 'swipe-view.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SwipeViewComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) card!: SwipeCard;

  /** Ett besvarat kort, att lagra. Skickas i samma stund domen faller. */
  @Output() readonly answered = new EventEmitter<Answer>();
  /** Klart här — ge nästa uppgift. Kommer efter att återkopplingen visats. */
  @Output() readonly completed = new EventEmitter<void>();

  /** `asking` för frågan, `revealed` för facit i återkalla, `feedback` efter domen. */
  phase: 'asking' | 'revealed' | 'feedback' = 'asking';
  /** Om svaret var rätt. Bara meningsfullt i `feedback`. */
  wasCorrect = false;
  /** Hur långt kortet dragits, i pixlar. Noll när det inte hålls. */
  drag = 0;

  private readonly changes = inject(ChangeDetectorRef);
  private startedAt = Date.now();
  /** Var fingret sattes ned. `null` när kortet inte hålls. */
  private dragFrom: number | null = null;
  private recallSeconds: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  ngOnChanges(): void {
    this.clearTimer();
    this.phase = 'asking';
    this.drag = 0;
    this.dragFrom = null;
    this.recallSeconds = null;
    this.startedAt = Date.now();
  }

  ngOnDestroy(): void {
    this.clearTimer();
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

  /** Om facit ska stå på kortet just nu. */
  get showsAnswer(): boolean {
    return this.card.kind === 'trueFalse' || this.phase !== 'asking';
  }

  /** Facit att visa när ett sant/falskt-svar var fel. */
  get truth(): string {
    return this.pair.sv;
  }

  onPointerDown(event: PointerEvent): void {
    if (this.phase === 'feedback') {
      return;
    }
    // Återkalla: fingret rör sig, alltså har tanken redan hunnit. Facit fram.
    if (this.reveal()) {
      return;
    }
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    this.dragFrom = event.clientX;
    this.drag = 0;
  }

  onPointerMove(event: PointerEvent): void {
    if (this.dragFrom === null) {
      return;
    }
    // Avståndet från där fingret sattes ned, inte summan av rörelser:
    // `movementX` saknas eller är noll för pekskärmar i flera webbläsare.
    this.drag = event.clientX - this.dragFrom;
  }

  onPointerUp(): void {
    if (this.phase === 'feedback' || this.dragFrom === null) {
      return;
    }
    this.dragFrom = null;
    const swiped = Math.abs(this.drag) >= SWIPE_THRESHOLD;
    const affirm = this.drag > 0;
    this.drag = 0;
    if (swiped) {
      this.answer(affirm);
    }
  }

  /** Tangentbordet: vänster är nej, höger är ja, mellanslag visar facit. */
  onKey(event: KeyboardEvent): void {
    if (this.phase === 'feedback') {
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

  /** Knapparna under kortet, för den som hellre trycker än sveper. */
  answer(affirm: boolean): void {
    if (this.phase === 'feedback') {
      return;
    }
    if (this.card.kind === 'recall' && this.phase === 'asking') {
      // Ett svar innan facit visats är ändå ett svar: tiden är den som gått.
      this.reveal();
    }

    const seconds = this.secondsFor();
    const correct =
      this.card.kind === 'trueFalse' ? affirm === this.card.statement.truthy : affirm;

    this.phase = 'feedback';
    this.wasCorrect = correct;
    this.answered.emit({
      pair: this.pair,
      step: this.card.kind === 'trueFalse' ? 'trueFalse' : 'recall',
      correct,
      seconds,
    });

    this.timer = setTimeout(() => {
      this.timer = null;
      this.completed.emit();
      this.changes.markForCheck();
    }, FEEDBACK_MS);
  }

  /** Knappen för den som hellre trycker än rör kortet. */
  showAnswer(): void {
    this.reveal();
  }

  /** Visar facit i återkalla och stannar klockan. Sant om något hände. */
  private reveal(): boolean {
    if (this.card.kind !== 'recall' || this.phase !== 'asking') {
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

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
