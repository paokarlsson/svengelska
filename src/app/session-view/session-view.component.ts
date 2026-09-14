/**
 * Passet: det som binder ihop de fyra vyerna till en enda upplevelse.
 *
 * Komponenten vet inget om pedagogik. Den frågar `TrainingSession` efter nästa
 * uppgift, ritar den vy uppgiften kräver, skickar tillbaka svaret och frågar
 * igen. Att steget kan byta mellan två kort — match, sedan skriva, sedan
 * sant/falskt — är inget den behöver hantera: det är bara nästa uppgift.
 *
 * Det finns med flit ingen knapp som väljer övning. Läget är motorns beslut
 * och inte användarens, och en meny här hade varit det första steget bort från
 * produktprincipen.
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
import { MatchViewComponent } from '../match-view/match-view.component';
import { SwipeCard, SwipeViewComponent } from '../swipe-view/swipe-view.component';
import { WriteViewComponent } from '../write-view/write-view.component';
import { Answer, SessionSummary, Task, TrainingSession } from '../training/session';
import { TrainingEngine } from '../training/training-engine';
import { WordBlock, WordPair } from '../words/word-catalog';

@Component({
  selector: 'app-session-view',
  templateUrl: 'session-view.component.html',
  styleUrl: 'session-view.component.scss',
  imports: [MatchViewComponent, SwipeViewComponent, WriteViewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionViewComponent implements OnInit, OnDestroy {
  @Input({ required: true }) block!: WordBlock;

  /** Tillbaka till listorna. */
  @Output() readonly exited = new EventEmitter<void>();
  /** Visa kartan över blocket. */
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
  summary: SessionSummary | null = null;

  ngOnInit(): void {
    this.start();
  }

  ngOnDestroy(): void {
    // Passet kan lämnas mitt i. Det som redan besvarats ska ligga kvar.
    void this.engine.flush();
  }

  start(): void {
    this.session = new TrainingSession(this.engine, this.block);
    this.summary = null;
    this.advance();
  }

  /** Andelen av passet som är avklarad, för mätaren i toppen. */
  get progress(): number {
    return Math.min(100, Math.round((this.session.answered / this.session.target) * 100));
  }

  /**
   * Svaren som räknas fram i toppen.
   *
   * Taket är passets längd fast en match-runda kan gå över den: rundan spelas
   * färdig, för att avbryta den mitt i vore att lämna par oparade på skärmen.
   * Mätaren är ett framsteg och inte ett facit, och «23 / 20» säger inget för
   * den som övar.
   */
  get tally(): number {
    return Math.min(this.session.answered, this.session.target);
  }

  get matchPairs(): readonly WordPair[] {
    return this.task?.kind === 'match' ? this.task.pairs : [];
  }

  get writePair(): WordPair | null {
    return this.task?.kind === 'written' ? this.task.pair : null;
  }

  onAnswer(answer: Answer): void {
    this.session.record(answer.pair, answer.step, answer.correct, answer.seconds);
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
    this.card = cardFor(this.task);
    if (this.task === null) {
      this.summary = this.session.summary();
      void this.engine.flush();
    }
  }
}

function cardFor(task: Task | null): SwipeCard | null {
  if (task?.kind === 'trueFalse') {
    return { kind: 'trueFalse', statement: task.statement };
  }
  if (task?.kind === 'recall') {
    return { kind: 'recall', pair: task.pair };
  }
  return null;
}
