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
import { SwipeAnswer, SwipeCard, SwipeViewComponent } from '../swipe-view/swipe-view.component';
import { RoundSummary, Task, TrainingSession } from '../training/session';
import { CALIBRATION_CARDS } from '../training/calibration';
import { ROUND_WORDS } from '../training/round';
import { TrainingEngine } from '../training/training-engine';
import { ALL_WORDS, WordBlock } from '../words/word-catalog';

@Component({
  selector: 'app-session-view',
  templateUrl: 'session-view.component.html',
  styleUrl: 'session-view.component.scss',
  imports: [SwipeViewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionViewComponent implements OnInit, OnDestroy {
  /** Listan nya ord hämtas ur. Repetitionen tar ändå hela katalogen. */
  @Input({ required: true }) week!: WordBlock;

  /** Tillbaka till startsidan. */
  @Output() readonly exited = new EventEmitter<void>();
  /** Visa kartan. */
  @Output() readonly mapped = new EventEmitter<void>();

  private readonly engine = inject(TrainingEngine);

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
    this.session = new TrainingSession(this.engine, ALL_WORDS, this.week.words);
    this.summary = null;
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

  leave(): void {
    void this.engine.flush();
    this.exited.emit();
  }

  private advance(): void {
    this.task = this.session.nextTask();
    this.card = this.task === null ? null : { kind: 'trueFalse', statement: this.task.statement };
    if (this.task === null) {
      this.summary = this.session.summary();
      void this.engine.flush();
    }
  }
}
