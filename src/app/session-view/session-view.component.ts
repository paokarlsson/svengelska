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
import { wordKey } from '../words/word-catalog';
import { WordLibrary } from '../words/word-library';
import { Tracker } from '../services/tracker';
import { ProfileStore } from '../services/profile-store';
import { BREAK_AT, BreakDeck } from '../services/break-deck';
import { Break } from '../intro/breaks';
import { skillOf, warmupFor } from '../intro/skill';

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
  private readonly tracker = inject(Tracker);
  private readonly profiles = inject(ProfileStore);
  private readonly breaks = inject(BreakDeck);

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
  /**
   * Avbrottet som ligger på bordet, eller `null`. Ett per varv, mitt i — se
   * `intro/breaks.ts`. Det räknas inte i varvet och rör inte sviten.
   */
  private breakItem: Break | null = null;
  /** Om varvet redan haft sitt avbrott. */
  private hadBreak = false;

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
    this.session = new TrainingSession(
      this.engine,
      this.library.words,
      this.list.words,
      Math.random,
      Date.now(),
      warmupFor(this.profiles.profile) ?? undefined,
    );
    this.summary = null;
    this.record = false;
    this.ending = null;
    this.breakItem = null;
    this.hadBreak = false;
    // Skrivs i bakgrunden nu, så att ett skrivet avbrott finns när varvet är
    // halvvägs. Utan nyckel gör det ingenting.
    this.breaks.refill();
    this.slots = Array.from({ length: this.session.target }, (_, index) => index);
    this.tracker.log('round', {
      list: this.list.id,
      cards: this.session.target,
      newLeft: this.engine.limitNewWords ? this.engine.newWordsLeft(this.library.words) : null,
    });
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
    if (this.breakItem !== null) {
      const note = this.breaks.answer(this.breakItem, answer.response);
      this.tracker.log('break', { ...this.breakItem, as: note?.answer ?? null });
      return;
    }
    if (this.task === null) {
      return;
    }
    const { statement, calibration } = this.task;
    const word = { pair: statement.pair, direction: statement.direction };
    const before = this.engine.statFor(word).box;
    const outcome = this.session.record(this.task, answer.response, answer.seconds);
    // Det vyn inte vet men loggen vill veta: vad motorn gjorde av svaret, och
    // hur lång tid det tog — i sekunder och som gånger kanalens golv, det mått
    // motorn dömer efter.
    const channel = `${statement.direction}:${statement.truthy}` as const;
    const floor = this.engine.baselineFor(channel);
    this.tracker.log('outcome', {
      key: wordKey(statement.pair, statement.direction),
      truthy: statement.truthy,
      probe: calibration,
      out: outcome,
      s: answer.seconds,
      floor: round2(floor),
      pace: answer.seconds === null ? null : round2(answer.seconds / floor),
      box: [before, this.engine.statFor(word).box],
      streak: this.session.streak,
    });
  }

  onCompleted(): void {
    this.breakItem = null;
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

  /**
   * Ett tryck på slutkortet.
   *
   * Efter ett varv är det «en gång till» — kortets framåt. På kortet som säger
   * att inget är moget finns inget framåt, och då är trycket vägen hem.
   */
  onEndTap(): void {
    if (this.summary === null) {
      this.exited.emit();
    } else {
      this.start();
    }
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
    this.tracker.log('leave', { answered: this.session.answered, of: this.session.target });
    this.profiles.noteLeave(this.session.summary());
    void this.engine.flush();
    this.exited.emit();
  }

  /** Om det är dags för varvets avbrott: halvvägs, en gång, och bara med en profil. */
  private breakDue(): boolean {
    const half = Math.ceil(this.session.target * BREAK_AT);
    return (
      !this.hadBreak &&
      this.breaks.available &&
      this.session.answered >= half &&
      this.session.answered < this.session.target
    );
  }

  /** Nivån som profilen säger just nu, för loggen. */
  private skill(): number | null {
    const profile = this.profiles.profile;
    return profile === null ? null : skillOf(profile);
  }

  private advance(): void {
    if (this.breakDue()) {
      this.hadBreak = true;
      this.breakItem = this.breaks.peek();
      if (this.breakItem !== null) {
        this.task = null;
        this.card = { kind: 'ask', text: this.breakItem.text };
        return;
      }
    }
    this.task = this.session.nextTask();
    this.card = this.task === null ? null : { kind: 'trueFalse', statement: this.task.statement };
    if (this.task === null) {
      this.summary = this.session.summary();
      this.record = this.engine.noteStreak(this.summary.longest);
      const { advanced, ...numbers } = this.summary;
      const aim = this.library.aimOf(this.list);
      const before = this.skill();
      this.profiles.noteRound(this.list.id, aim, this.summary);
      this.tracker.log('round.end', {
        ...numbers,
        advanced: advanced.length,
        record: this.record,
        aim,
        skill: [before, this.skill()],
      });
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

/** Två decimaler räcker för loggen. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
