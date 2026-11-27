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
  ChangeDetectorRef,
  Component,
  EventEmitter,
  OnDestroy,
  OnInit,
  Output,
  inject,
} from '@angular/core';
import { QuestionNode, TreeWalk } from '../intro/follow-up';
import { IntroCard, IntroPhase, IntroRun } from '../intro/intro-run';
import { sayPersonality } from '../intro/personality';
import { Profile } from '../intro/profile';
import { sayLevel } from '../intro/skill';
import { FollowUpWriter } from '../services/follow-up-writer';
import { ListWriteError } from '../services/list-write-error';
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
/**
 * Inga frågetecken, inte heller här. Varje kort är ett påstående som är sant
 * eller falskt, och en rubrik som frågar något gör kortet under den till ett
 * svar på en fråga i stället.
 */
const PHASE_TITLE: Record<IntroPhase, string> = {
  about: 'Det du gillar',
  you: 'Lite om dig',
  how: 'Hur du vill ha det',
  // Ingen egen rubrik: ett avbrott ska inte presentera sig som ett.
  break: 'Lite om dig',
  words: 'Sant eller falskt',
};

/**
 * Var rundan står efter de fasta korten.
 *
 * `check` frågar om appen vet nog. `more` visar en följdfråga, `waiting` väntar
 * på nästa träd. `end` är slutkortet för den som inte har någon nyckel — utan
 * den finns inga följdfrågor att erbjuda.
 */
type After = 'check' | 'more' | 'waiting' | 'end';

/** Så många intressen kortet visar innan resten blir ett tal. */
const SHOWN_INTERESTS = 5;

@Component({
  selector: 'app-intro-view',
  templateUrl: 'intro-view.component.html',
  styleUrl: 'intro-view.component.scss',
  imports: [SwipeViewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IntroViewComponent implements OnInit, OnDestroy {
  /** Rundan är klar och profilen sparad. */
  @Output() readonly finished = new EventEmitter<void>();
  /** Rundan lämnades. Ingenting sparades. */
  @Output() readonly skipped = new EventEmitter<void>();

  private readonly profiles = inject(ProfileStore);
  private readonly tracker = inject(Tracker);
  private readonly writer = inject(FollowUpWriter);
  private readonly changes = inject(ChangeDetectorRef);

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

  /** Var rundan står när de fasta korten är slut. `null` medan de pågår. */
  after: After | null = null;
  /**
   * Kortet som frågar om appen vet nog. Ett nytt objekt varje gång det visas,
   * så att svepvyn lägger fram det på nytt efter en omgång följdfrågor.
   */
  check: ChoiceCard | null = null;
  /** Vägen genom trädet som pågår. */
  private walk: TreeWalk | null = null;
  /** Nästa träd, skrivet i förväg och ännu inte påbörjat. */
  private ready: QuestionNode | null = null;
  /** Sant medan nästa träd skrivs. */
  private fetching = false;
  /** Sant när det inte gick att skriva fler frågor. Då finns bara ja kvar. */
  private stuck = false;
  private gone = false;

  ngOnInit(): void {
    this.advance();
  }

  ngOnDestroy(): void {
    this.gone = true;
  }

  get title(): string {
    if (this.after === 'more' || this.after === 'waiting') {
      return 'Lite till om dig';
    }
    if (this.after === 'check') {
      return 'Det här vet jag';
    }
    return this.current === null ? 'Klart' : PHASE_TITLE[this.current.phase];
  }

  /** Mätarens fyllnad i procent. */
  get progress(): number {
    return Math.round(this.run.progress * 100);
  }

  /**
   * Intressena på slutkortet. Högst fem: den som sagt ja till alla fick annars
   * inte plats med nivån och personligheten, eller med frågan kortet ställer.
   */
  get shownInterests(): string[] {
    return (this.result?.interests ?? []).slice(0, SHOWN_INTERESTS);
  }

  get hiddenInterests(): number {
    return Math.max(0, (this.result?.interests.length ?? 0) - SHOWN_INTERESTS);
  }

  /** Hur många följdfrågor som besvarats. Visas på kortet som frågar om det räcker. */
  get learned(): number {
    return this.result?.notes?.length ?? 0;
  }

  /** Nivån i ord. Se `sayLevel()`. */
  get levelText(): string | null {
    const level = this.result?.level ?? null;
    return level === null ? null : sayLevel(level);
  }

  /** Personligheten i en mening, eller `null` om inget drag stack ut. */
  get personalityText(): string | null {
    return this.result === null ? null : sayPersonality(this.result);
  }

  onAnswer(answer: SwipeAnswer): void {
    if (this.after === 'more') {
      this.answerFollowUp(answer.response);
      return;
    }
    this.run.answer(answer.response);
  }

  onCompleted(): void {
    if (this.after === 'more') {
      this.showFollowUp();
      return;
    }
    this.advance();
  }

  onCheckSwipe(answer: SwipeAnswer): void {
    this.swiped = answer.response;
  }

  /**
   * Svaret på «Du vet vem jag är nu».
   *
   * Ja går till glosorna. Nej ger tre frågor till — redan skrivna om det gick,
   * annars en kort väntan.
   */
  onCheckLanded(): void {
    const swiped = this.swiped;
    this.swiped = null;
    if (swiped === 'affirm') {
      this.finish();
    } else if (swiped === 'deny' && !this.stuck) {
      if (this.ready !== null) {
        this.startTree(this.ready);
      } else {
        this.after = 'waiting';
        this.card = null;
        this.fetch([]);
      }
    }
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
      // Vanorna följer med när startrundan görs om: de är vad någon gjort, och
      // det har inte ändrats av att frågorna ställts igen. Varvens anteckningar
      // om nivån gör det inte — ett nytt prov är en ny utgångspunkt.
      const habits = this.profiles.profile?.habits;
      this.result = habits === undefined ? this.run.profile() : { ...this.run.profile(), habits };
      // Sparas här, i samma stund sista kortet är besvarat, och inte när
      // slutkortet svepts. Det som svarats är svarat; det ska inte hänga på
      // att någon också hittar ut ur rundan.
      this.profiles.save(this.result);
      this.tracker.log('intro.end', { ...this.result, cards: this.run.answered });
      if (this.writer.available) {
        this.showCheck();
      } else {
        this.after = 'end';
      }
      return;
    }
    this.card =
      this.current.kind === 'probe'
        ? { kind: 'trueFalse', statement: this.current.statement }
        : { kind: 'ask', text: this.current.text };
  }

  /**
   * Lägger fram frågan om appen vet nog, och börjar skriva nästa träd.
   *
   * Trädet skrivs redan nu, innan någon sagt nej: den som vill ha fler frågor
   * ska inte behöva vänta på dem. Säger hen ja är det ett kort anrop i onödan.
   */
  private showCheck(): void {
    this.after = 'check';
    this.card = null;
    this.walk = null;
    this.check = {
      kind: 'choice',
      // Ett påstående och inte en fråga, som alla andra kort: sant eller falskt.
      label: 'Du vet vem jag är nu',
      affirm: 'Sant, glosor',
      deny: this.stuck ? null : 'Falskt, fråga mer',
      unsure: null,
    };
    if (this.ready === null) {
      this.fetch([]);
    }
  }

  private startTree(tree: QuestionNode): void {
    this.ready = null;
    this.walk = new TreeWalk(tree);
    this.after = 'more';
    this.showFollowUp();
  }

  /** Nästa kort i trädet, eller frågan om det räcker när vägen är gången. */
  private showFollowUp(): void {
    const text = this.walk?.current ?? null;
    if (text === null) {
      this.showCheck();
      return;
    }
    this.card = { kind: 'ask', text };
  }

  private answerFollowUp(response: Response): void {
    const walk = this.walk;
    const note = walk?.answer(response) ?? null;
    if (walk === null || note === null || this.result === null) {
      return;
    }
    // Sparas för varje svar, av samma skäl som startrundan sparas innan
    // slutkortet svepts: det som svarats är svarat.
    this.result = { ...this.result, notes: [...(this.result.notes ?? []), note] };
    this.profiles.save(this.result);

    // Efter första kortet i trädet är resten känt nog för att skriva nästa:
    // det tar ungefär lika lång tid som två svep.
    if (walk.notes.length === 1) {
      this.fetch(walk.upcoming());
    }
  }

  /** Skriver nästa träd, om inget redan skrivs eller ligger färdigt. */
  private fetch(upcoming: readonly string[]): void {
    if (this.fetching || this.ready !== null || this.stuck || this.result === null) {
      return;
    }
    this.fetching = true;
    const began = Date.now();
    this.tracker.log('followup.ask', { upcoming: upcoming.length });
    this.writer
      .write(this.result, upcoming)
      .then((tree) => {
        this.tracker.log('followup.got', { ms: Date.now() - began, tree: flatten(tree) });
        if (this.gone) {
          return;
        }
        this.ready = tree;
        if (this.after === 'waiting') {
          this.startTree(tree);
        }
      })
      .catch((error: unknown) => {
        this.tracker.log('followup.failed', {
          ms: Date.now() - began,
          why: error instanceof ListWriteError ? error.reason : 'failed',
        });
        if (this.gone) {
          return;
        }
        this.stuck = true;
        if (this.after === 'waiting' || this.after === 'check') {
          // Utan fler frågor att ställa är ja det enda hållet.
          this.showCheck();
        }
      })
      .finally(() => {
        this.fetching = false;
        this.changes.markForCheck();
      });
  }
}

/** Trädet som en rad per påstående, för loggen. Indraget efter djup. */
function flatten(node: QuestionNode | null, depth = 0): string[] {
  if (node === null) {
    return [];
  }
  return [`${'  '.repeat(depth)}${node.text}`, ...flatten(node.yes, depth + 1), ...flatten(node.no, depth + 1)];
}
