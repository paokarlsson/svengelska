/**
 * Startrundan på skärmen: några kort, och vad appen fick veta av dem.
 *
 * Vyn äger ingenting utom kortet som ligger framme. Vilka kort som kommer, i
 * vilken ordning och vad ett svar betyder avgör `IntroRun`; var profilen
 * hamnar avgör `ProfileStore`. Det är samma uppdelning som mellan
 * `session-view` och `TrainingSession`, och av samma skäl.
 *
 * Kortet är appens vanliga, med flit. En startrunda med egna knappar och egna
 * skärmar hade lärt ut ett gränssnitt som sedan aldrig används igen.
 */
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  OnInit,
  Output,
  inject,
} from '@angular/core';
import { IntroCard, IntroPhase, IntroRun } from '../intro/intro-run';
import { Profile, TOP_LEVEL } from '../intro/profile';
import { ProfileStore } from '../services/profile-store';
import { Tracker } from '../services/tracker';
import {
  ChoiceCard,
  SwipeAnswer,
  SwipeCard,
  SwipeViewComponent,
} from '../swipe-view/swipe-view.component';
import { Response } from '../training/word-state';

/** Rubriken över kortet. Säger vad korten handlar om, inte hur många som är kvar. */
const PHASE_TITLE: Record<IntroPhase, string> = {
  about: 'Vad gillar du?',
  you: 'Lite om dig',
  words: 'Några ord',
};

@Component({
  selector: 'app-intro-view',
  templateUrl: 'intro-view.component.html',
  styleUrl: 'intro-view.component.scss',
  imports: [SwipeViewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IntroViewComponent implements OnInit {
  /** Rundan är klar och profilen sparad. */
  @Output() readonly finished = new EventEmitter<void>();
  /** Rundan lämnades. Ingenting sparades. */
  @Output() readonly skipped = new EventEmitter<void>();

  private readonly profiles = inject(ProfileStore);
  private readonly tracker = inject(Tracker);

  private readonly run = new IntroRun();
  private current: IntroCard | null = null;

  /**
   * Kortet som skickas till svepvyn.
   *
   * Byggs en gång per kort och inte i en getter, av samma skäl som i
   * `session-view`: ett nytt objekt vid varje ändringsdetektering räknas som
   * ett nytt `@Input` och nollställer kortet under fingret.
   */
  card: SwipeCard | null = null;
  /** Vad rundan kom fram till. `null` medan den pågår. */
  result: Profile | null = null;
  /**
   * Slutkortet. Ett håll, och det går vidare.
   *
   * Här stod förut «Gör om» till vänster. Det var ett svep på en tiondels
   * sekund som kastade tjugoen svar, och loggen visade det göras två gånger av
   * någon som ville vidare — vänster är «nästa» för den som bläddrar. Att göra
   * om finns kvar under Inställningar, där det inte går att råka göra.
   */
  readonly ending: ChoiceCard = {
    kind: 'choice',
    label: 'Då vet jag lite mer',
    affirm: 'Vidare',
    deny: null,
    unsure: null,
  };
  /** Hållet slutkortet sveptes åt. Verkställs när kortet lämnat bordet. */
  private swiped: Response | null = null;

  ngOnInit(): void {
    this.advance();
  }

  get title(): string {
    return this.current === null ? 'Klart' : PHASE_TITLE[this.current.phase];
  }

  /** Mätarens fyllnad i procent. */
  get progress(): number {
    return Math.round(this.run.progress * 100);
  }

  /**
   * Nivån i ord.
   *
   * Sagd som var det är lagom att börja och inte som ett betyg: den som nyss
   * svept fel på `house` ska inte mötas av en nolla.
   */
  get levelText(): string | null {
    const level = this.result?.level ?? null;
    if (level === null) {
      return null;
    }
    if (level === 0) {
      return 'Vi börjar från början, med de vanligaste orden.';
    }
    if (level >= TOP_LEVEL) {
      return 'Du kan mycket redan. Det blir ord som får dig att tänka efter.';
    }
    return level <= 2
      ? 'Du kan vardagsorden. Vi bygger vidare därifrån.'
      : 'Du kan mer än vardagsorden. Det blir ord med lite motstånd.';
  }

  onAnswer(answer: SwipeAnswer): void {
    this.run.answer(answer.response);
  }

  onCompleted(): void {
    this.advance();
  }

  onEndSwipe(answer: SwipeAnswer): void {
    this.swiped = answer.response;
  }

  onEndLanded(): void {
    const swiped = this.swiped;
    this.swiped = null;
    if (swiped === 'affirm') {
      this.finish();
    }
  }

  /** Går vidare. Profilen är redan sparad — se `advance()`. */
  finish(): void {
    this.finished.emit();
  }

  private advance(): void {
    this.current = this.run.next();
    if (this.current === null) {
      this.card = null;
      this.result = this.run.profile();
      // Sparas här, i samma stund sista kortet är besvarat, och inte när
      // slutkortet svepts. Det som svarats är svarat; det ska inte hänga på
      // att någon också hittar ut ur rundan.
      this.profiles.save(this.result);
      this.tracker.log('intro.end', { ...this.result, cards: this.run.answered });
      return;
    }
    this.card =
      this.current.kind === 'ask'
        ? { kind: 'ask', text: this.current.text }
        : { kind: 'trueFalse', statement: this.current.statement };
  }
}
