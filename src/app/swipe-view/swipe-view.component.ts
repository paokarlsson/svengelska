/**
 * Kortet som svepas.
 *
 * **Höger är sant, vänster är falskt, ner är «vet ej».** Det tredje svaret är
 * inte en bekvämlighet utan grenens viktigaste mätvärde: med två alternativ är
 * ett sant/falskt-kort ett myntkast, och hälften av alla blinda gissningar går
 * in i domen som om de vore kunskap. Uppåt är obundet — en gest som inte
 * betyder något ska inte göra något.
 *
 * Vyn dömer ingenting. Den skickar *gesten* — `affirm`, `deny` eller `unsure` —
 * och hur lång tid det tog, och låter motorn avgöra om kortet var sant, om
 * svaret var i tempo och vad det gör med repetitionsplanen. En vy som räknade ut
 * en tröskel själv vore den första sprickan i treskiktningen.
 *
 * När en dragning är ett svar, och vilket, avgörs av `swipe-gesture.ts` och
 * inte här: det är en regel, och regler i den här appen ska gå att pröva utan
 * en skärm.
 *
 * **Gesten i sidled är `ganger`:s, tagen rakt av.** Kortet är ett föremål på ett
 * bord: det lutar med draget, stämplas med det svar draget är på väg att ge,
 * och far ut ur bild åt det hållet. Nedåt är appens eget tillägg, och det ser
 * annorlunda ut med flit — kortet läggs undan i stället för att slungas iväg,
 * eftersom «vet ej» inte är ett svar att kasta ifrån sig.
 *
 * Återkalla-halvan står kvar fast passet aldrig ber om den. Den är gömd bakom
 * `scope.ts` och inte borttagen, av samma skäl som stegen: en gren ska gå att
 * kasta utan att vägen tillbaka följer med.
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
import { DragSample, commitsSwipe, downProgress, swipeProgress } from './swipe-gesture';
import { Statement } from '../words/distractors';
import { DirectedWord, answerOf, promptOf } from '../words/word-catalog';
import { Response } from '../training/word-state';

export type SwipeCard =
  | { kind: 'trueFalse'; statement: Statement }
  | { kind: 'recall'; word: DirectedWord };

/** Vad vyn skickar ifrån sig: gesten och tiden, aldrig en dom. */
export interface SwipeAnswer {
  response: Response;
  /** Sekunder, eller `null` när svaret inte gick att tajma. */
  seconds: number | null;
}

/** Hur länge kortet flyger ut innan nästa läggs fram. */
const LEAVE_MS = 260;

/**
 * Hur länge domen står kvar.
 *
 * Ett rätt kvitteras, ett fel ska hinna läsas, och ett «vet ej» ska hinna
 * *läras*: där finns ingen dom att ta in, bara en översättning som aldrig
 * kommit fram. Det är det enda kortet i appen vars tid är undervisningstid rakt
 * igenom, och därför det som får stå längst.
 */
const VERDICT_CORRECT_MS = 900;
const VERDICT_WRONG_MS = 1800;
const VERDICT_UNSURE_MS = 2200;

/** Domen under kortet. Lever kvar när nästa kort lagts fram. */
interface Verdict {
  tone: 'right' | 'wrong' | 'taught';
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

  /** Ett besvarat kort. Skickas i samma stund gesten är avgjord. */
  @Output() readonly answered = new EventEmitter<SwipeAnswer>();
  /** Klart här — ge nästa uppgift. Kommer när kortet lämnat bordet. */
  @Output() readonly completed = new EventEmitter<void>();

  @ViewChild(CdkDrag) private drag?: CdkDrag;

  /** `asking` för frågan, `revealed` när facit ligger uppe i återkalla. */
  phase: 'asking' | 'revealed' = 'asking';

  /** -1 helt åt vänster, 0 i vila, +1 helt åt höger. */
  progress = 0;
  /** 0 i vila, 1 när kortet dragits hela vägen ned. */
  down = 0;
  /** Vart kortet är på väg, eller `null` när det ligger stilla. */
  leaving: 'right' | 'left' | 'down' | null = null;
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
    this.down = 0;
    this.leaving = null;
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

  /** Sant medan kortet lämnar bordet — då tas inga nya svar emot. */
  get locked(): boolean {
    return this.leaving !== null;
  }

  /** Återkalla innan facit visats: tanken ska göra sitt jobb först. */
  get thinking(): boolean {
    return this.card.kind === 'recall' && this.phase === 'asking';
  }

  /** Kortet lutar bara med sidledsdraget. Ett «vet ej» läggs undan rakt. */
  get rotation(): number {
    return this.progress * 12;
  }

  /** 0 när kortet ligger stilla, 1 när det dragits hela vägen åt `dir`. */
  strength(dir: 1 | -1): number {
    return Math.max(0, dir * this.progress);
  }

  /** Ordet som frågas efter, åt det håll kortet gäller. */
  get prompt(): string {
    return this.card.kind === 'trueFalse'
      ? this.card.statement.asked
      : promptOf(this.card.word.pair, this.card.word.direction);
  }

  /** Det som står under ordet: påståendets översättning, eller facit. */
  get shown(): string {
    return this.card.kind === 'trueFalse'
      ? this.card.statement.shown
      : answerOf(this.card.word.pair, this.card.word.direction);
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
    this.down = downProgress($event.distance.y, window.innerHeight);

    this.samples.push({ x: $event.distance.x, y: $event.distance.y, t: performance.now() });
    if (this.samples.length > 5) {
      this.samples.shift();
    }
  }

  dragEnd($event: CdkDragEnd): void {
    const { x, y } = $event.distance;
    const response = commitsSwipe(x, y, this.samples, window.innerWidth, window.innerHeight);
    this.samples = [];

    if (response !== null) {
      this.answer(response);
    } else {
      this.progress = 0;
      this.down = 0;
      this.drag?.reset();
    }
  }

  /** Fingret på kortet i återkalla: tanken har redan hunnit. Facit fram. */
  onPointerDown(): void {
    this.reveal();
  }

  /** Tangentbordet: höger ja, vänster nej, ner vet ej, mellanslag visar facit. */
  onKey(event: KeyboardEvent): void {
    if (this.locked) {
      return;
    }
    if (event.key === 'ArrowRight') {
      this.answer('affirm');
    } else if (event.key === 'ArrowLeft') {
      this.answer('deny');
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.answer('unsure');
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.reveal();
    }
    // ArrowUp lämnas obunden av samma skäl som gesten uppåt gör ingenting.
  }

  /** Svaret, oavsett om det kom som ett svep, en tangent eller en knapp. */
  answer(response: Response): void {
    if (this.locked) {
      return;
    }
    if (this.thinking) {
      // Ett svar innan facit visats är ändå ett svar: tiden är den som gått.
      this.reveal();
    }

    const seconds = this.secondsFor();
    const correct = this.wasCorrect(response);
    if (correct === false) {
      this.buzz();
    }
    this.answered.emit({ response, seconds });
    this.showVerdict(response, correct);

    this.leaving = response === 'unsure' ? 'down' : response === 'affirm' ? 'right' : 'left';
    this.progress = response === 'affirm' ? 1 : response === 'deny' ? -1 : 0;
    this.down = response === 'unsure' ? 1 : 0;
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
   * Om svaret stämde — för återkopplingen, och för ingenting annat.
   *
   * Att vyn räknar ut det här bryter inte mot regeln att en vy aldrig räknar ut
   * en tröskel. Det som är förbjudet är att läsa ett *mått*: om svaret var i
   * tempo, om ordet sitter, vilken låda det hamnar i. Om det som står på kortet
   * stämmer är däremot kortets eget innehåll — `truthy` ligger i påståendet vyn
   * redan ritar — och att skicka den frågan till motorn och tillbaka bara för
   * att få skriva «Rätt!» vore ceremoni och inte arkitektur.
   *
   * `null` i återkalla: där är det den som övar som dömer, och då finns inget
   * att ha en åsikt om.
   */
  private wasCorrect(response: Response): boolean | null {
    if (response === 'unsure' || this.card.kind !== 'trueFalse') {
      return null;
    }
    return (response === 'affirm') === this.card.statement.truthy;
  }

  /**
   * Domen under kortet.
   *
   * Tre toner, en per svar. Ett rätt kvitteras. Ett fel rättas — det är det
   * enda på skärmen som bär ny kunskap, och det ska hinna läsas medan nästa
   * kort redan ligger framme. Ett «vet ej» får ingen dom alls, bara
   * översättningen: det finns ingenting att rätta när ingen påstod något, och
   * hela kortets tid är undervisningstid.
   */
  private showVerdict(response: Response, correct: boolean | null): void {
    const truth =
      this.card.kind === 'trueFalse'
        ? answerOf(this.card.statement.pair, this.card.statement.direction)
        : this.shown;
    const facit = `${this.prompt} = ${truth}`;

    if (response === 'unsure') {
      this.verdict = { tone: 'taught', text: facit };
    } else if (correct === false) {
      this.verdict = { tone: 'wrong', text: `Nej — ${facit}` };
    } else {
      this.verdict = { tone: 'right', text: 'Rätt!' };
    }

    this.clear(this.verdictTimer);
    this.verdictTimer = setTimeout(
      () => {
        this.verdictTimer = null;
        this.verdict = undefined;
        this.changes.markForCheck();
      },
      response === 'unsure'
        ? VERDICT_UNSURE_MS
        : correct === false
          ? VERDICT_WRONG_MS
          : VERDICT_CORRECT_MS,
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

  /** Ett fel skakar till. Ett «vet ej» gör det inte — det är inget misstag. */
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
