/**
 * Varvet: det som binder kortet, dirigenten och motorn till en upplevelse.
 *
 * Komponenten vet inget om pedagogik. Den frågar `TrainingSession` efter nästa
 * uppgift, ritar kortet, skickar tillbaka gesten och frågar igen.
 *
 * Det finns med flit ingen väljare här — varken av steg eller av ordlista. Det
 * enda som valts är var nya ord hämtas ifrån, och det valet gjordes på
 * startsidan. Vilka ord varvet innehåller är planens sak.
 */
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  inject,
} from '@angular/core';
import {
  ChoiceCard,
  SwipeAnswer,
  SwipeCard,
  SwipeViewComponent,
} from '../swipe-view/swipe-view.component';
import { RoundSummary, Task, TrainingSession } from '../training/session';
import { CALIBRATION_CARDS } from '../training/calibration';
import { ROUND_WORDS } from '../training/round';
import { TrainingEngine } from '../training/training-engine';
import { Response } from '../training/word-state';
import { WordBlock } from '../words/word-catalog';
import { WordLibrary } from '../words/word-library';

/** Så många flyttade håll som skrivs ut under slutkortet. */
const ADVANCED_SHOWN = 4;

@Component({
  selector: 'app-session-view',
  templateUrl: 'session-view.component.html',
  styleUrl: 'session-view.component.scss',
  imports: [SwipeViewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionViewComponent implements OnInit, OnDestroy {
  /** Listan nya ord hämtas ur. Repetitionen tar ändå hela katalogen. */
  @Input({ required: true }) list!: WordBlock;

  /** Tillbaka till startsidan. */
  @Output() readonly exited = new EventEmitter<void>();
  /** Visa kartan. */
  @Output() readonly mapped = new EventEmitter<void>();

  private readonly engine = inject(TrainingEngine);
  private readonly library = inject(WordLibrary);

  session!: TrainingSession;
  task: Task | null = null;
  /**
   * Kortet som skickas till svepvyn.
   *
   * Byggs en gång per uppgift och inte i en getter: en getter som returnerar
   * ett nytt objekt vid varje ändringsdetektering hade räknats som ett nytt
   * `@Input` och nollställt kortet mitt under fingret.
   */
  card: SwipeCard | null = null;
  summary: RoundSummary | null = null;
  /** Om varvets längsta svit slog rekordet. */
  record = false;
  /**
   * Kortet varvet slutar med — eller börjar och slutar med, om inget var moget.
   *
   * Ett fält av samma skäl som `card`. Hållen är varvets vägar ut: höger en
   * gång till, vänster hem, ner till kartan.
   */
  ending: ChoiceCard | null = null;
  /** Mätarens fack, ett per kort varvet lovar. */
  slots: readonly number[] = [];
  /** Hållet slutkortet sveptes åt. Verkställs när kortet lämnat bordet. */
  private swiped: Response | null = null;

  readonly roundWords = ROUND_WORDS;
  readonly calibrationCards = CALIBRATION_CARDS;

  ngOnInit(): void {
    this.start();
  }

  ngOnDestroy(): void {
    // Varvet kan lämnas mitt i. Det som redan besvarats ska ligga kvar.
    void this.engine.flush();
  }

  start(): void {
    this.session = new TrainingSession(this.engine, this.library.words, this.list.words);
    this.summary = null;
    this.record = false;
    this.ending = null;
    this.slots = Array.from({ length: this.session.target }, (_, index) => index);
    if (this.session.target === 0) {
      // Inget var moget och inget nytt fanns. Ett kort säger det, och det enda
      // hållet är hem.
      this.ending = {
        kind: 'choice',
        label: 'Inget är moget just nu',
        affirm: null,
        deny: 'Hem',
        unsure: null,
      };
      return;
    }
    this.advance();
  }

  /** Om kortet på skärmen är ett kalibreringsprov och inte ett riktigt kort. */
  get warmingUp(): boolean {
    return this.task?.calibration !== null && this.task !== null;
  }

  /** Andelen av varvet som är avklarad, för mätaren i toppen. */
  get progress(): number {
    if (this.session.target === 0) {
      return 100;
    }
    return Math.min(100, Math.round((this.session.answered / this.session.target) * 100));
  }

  /**
   * Svaren som räknas fram i toppen.
   *
   * Taket är varvets längd fast missade kort kommer tillbaka utöver den. De
   * korten är inte extra arbete som mätaren ska växa av — de är samma arbete en
   * gång till, och «23 / 20» säger inget för den som övar.
   */
  get tally(): number {
    return Math.min(this.session.answered, this.session.target);
  }

  /** Om varvet inte hade tio ord att erbjuda. Sägs rakt ut i stället för fylls ut. */
  get short(): boolean {
    return this.session.short;
  }

  get empty(): boolean {
    return this.session.target === 0;
  }

  onAnswer(answer: SwipeAnswer): void {
    if (this.task !== null) {
      this.session.record(this.task, answer.response, answer.seconds);
    }
  }

  onCompleted(): void {
    this.advance();
  }

  /**
   * Hållen som flyttade upp en låda, som en mening.
   *
   * Högst fyra skrivs ut. Ett varv där allt gick rätt flyttar tjugo håll, och
   * tjugo par under kortet är en vägg och ingen upplysning.
   */
  get advancedText(): string | null {
    const moved = this.summary?.advanced ?? [];
    if (moved.length === 0) {
      return null;
    }
    const shown = moved
      .slice(0, ADVANCED_SHOWN)
      .map((word) =>
        word.direction === 'en'
          ? `${word.pair.en} → ${word.pair.sv}`
          : `${word.pair.sv} → ${word.pair.en}`,
      );
    const rest = moved.length - shown.length;
    return rest > 0 ? `${shown.join(', ')} och ${rest} till` : shown.join(', ');
  }

  /** Sviten just nu. Se `TrainingSession.streak` för vad som räknas. */
  get streak(): number {
    return this.session.streak;
  }

  onEndSwipe(answer: SwipeAnswer): void {
    this.swiped = answer.response;
  }

  /** Slutkortet har lämnat bordet: nu händer det hållet betydde. */
  onEndLanded(): void {
    const swiped = this.swiped;
    this.swiped = null;
    if (swiped === 'affirm') {
      this.start();
    } else if (swiped === 'deny') {
      this.exited.emit();
    } else if (swiped === 'unsure') {
      this.mapped.emit();
    }
  }

  leave(): void {
    void this.engine.flush();
    this.exited.emit();
  }

  private advance(): void {
    this.task = this.session.nextTask();
    this.card = this.task === null ? null : { kind: 'trueFalse', statement: this.task.statement };
    if (this.task === null) {
      this.summary = this.session.summary();
      this.record = this.engine.noteStreak(this.summary.longest);
      this.ending = {
        kind: 'choice',
        label: 'Varvet är klart',
        affirm: 'En gång till',
        deny: 'Hem',
        unsure: 'Kartan',
        face: 'mint',
      };
      void this.engine.flush();
    }
  }
}
