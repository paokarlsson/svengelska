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
import { Tracker, compactPath } from '../services/tracker';
import { Statement } from '../words/distractors';
import { DirectedWord, answerOf, promptOf } from '../words/word-catalog';
import { Response } from '../training/word-state';

/**
 * Vad som ligger på kortet.
 *
 * `ask` är startrundans kort: ett påstående om en själv, «Jag gillar djur».
 * Det har inget facit och får därför ingen dom — men det svepas med samma tre
 * gester, och det är meningen: den som svarat på det kan kortet.
 */
export type SwipeCard =
  | { kind: 'trueFalse'; statement: Statement }
  | { kind: 'recall'; word: DirectedWord }
  | { kind: 'ask'; text: string }
  | ChoiceCard;

/**
 * Ett kort som är ett vägval och ingen fråga: startsidans lista, varvets slut.
 *
 * Det är så «svep gör allt» hålls. Appen har inga knappar för att börja,
 * bläddra eller gå hem — den har ett kort, och hållen heter olika saker
 * beroende på var man står. Höger är alltid framåt, vänster alltid tillbaka
 * eller nästa, ner alltid något annat.
 *
 * Vad som står *på* kortet äger den som lägger fram det: innehållet skickas in
 * som mallinnehåll, och kortet bär bara gesten. Ett håll som är `null` finns
 * inte, och ett drag åt det fjädrar tillbaka.
 */
export interface ChoiceCard {
  kind: 'choice';
  /** Vad kortet handlar om, för den som inte ser det. */
  label: string;
  affirm: string | null;
  deny: string | null;
  unsure: string | null;
  /** Kortets färg. Gult är en lista, mint är ett avslutat varv. */
  face?: 'sun' | 'mint';
}

/** Vad vyn skickar ifrån sig: gesten och tiden, aldrig en dom. */
export interface SwipeAnswer {
  response: Response;
  /** Sekunder, eller `null` när svaret inte gick att tajma. */
  seconds: number | null;
}

/** Vad ett svar heter: i raden under kortet, och som stämpel på det. */
interface Naming {
  label: string;
  /** Samma ord i kortformat — det ska rymmas på kortet. */
  stamp: string;
}

/**
 * Vad svaren heter, per sorts kort.
 *
 * En tabell och inte tre villkor per getter, så att ett fjärde kort är en rad
 * och inte sex ändringar.
 */
const NAMES: Record<
  Exclude<SwipeCard['kind'], 'choice'>,
  { affirm: Naming; deny: Naming; unsure: Naming }
> = {
  trueFalse: {
    affirm: { label: 'Rätt', stamp: 'RÄTT' },
    deny: { label: 'Fel', stamp: 'FEL' },
    unsure: { label: 'Vet ej', stamp: 'VET EJ' },
  },
  recall: {
    affirm: { label: 'Jag kunde det', stamp: 'KUNDE' },
    deny: { label: 'Jag kunde inte', stamp: 'KUNDE INTE' },
    unsure: { label: 'Vet ej', stamp: 'VET EJ' },
  },
  // Om en själv finns inget att inte veta. Det tredje svaret är att slippa.
  ask: {
    affirm: { label: 'Ja', stamp: 'JA' },
    deny: { label: 'Nej', stamp: 'NEJ' },
    unsure: { label: 'Hoppa över', stamp: 'HOPPA ÖVER' },
  },
};

/** Hur snett kortet ligger i vila, i grader. */
const REST_TILT = -1.5;

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
  private readonly tracker = inject(Tracker);
  /**
   * Dragningens hela väg, för loggen: tid sedan draget började, och hur långt
   * kortet flyttats. `samples` ovan minns bara de sista punkterna, eftersom
   * farten bara behöver dem.
   */
  private path: [number, number, number][] = [];
  private dragStartedAt = 0;
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
    this.path = [];
    this.recallSeconds = null;
    this.startedAt = Date.now();
    this.tracker.log('card', describeCard(this.card));
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

  /**
   * Kortets lutning.
   *
   * I vila ligger det lite snett, som ett kort någon lagt ifrån sig — ett
   * spikrakt kort är en ruta. Därifrån lutar det bara med sidledsdraget; ett
   * «vet ej» läggs undan utan att vridas.
   */
  get rotation(): number {
    return REST_TILT + this.progress * 12;
  }

  /** 0 när kortet ligger stilla, 1 när det dragits hela vägen åt `dir`. */
  strength(dir: 1 | -1): number {
    return Math.max(0, dir * this.progress);
  }

  /** Ordet som frågas efter, åt det håll kortet gäller. */
  get prompt(): string {
    if (this.card.kind === 'choice') {
      return '';
    }
    if (this.card.kind === 'ask') {
      return this.card.text;
    }
    return this.card.kind === 'trueFalse'
      ? this.card.statement.asked
      : promptOf(this.card.word.pair, this.card.word.direction);
  }

  /** Om kortet är ett påstående om en själv och inte en glosa. */
  get asking(): boolean {
    return this.card.kind === 'ask';
  }

  /** Det som står under ordet: påståendets översättning, eller facit. */
  get shown(): string {
    if (this.card.kind === 'ask' || this.card.kind === 'choice') {
      return '';
    }
    return this.card.kind === 'trueFalse'
      ? this.card.statement.shown
      : answerOf(this.card.word.pair, this.card.word.direction);
  }

  /**
   * Vad ett håll heter på det här kortet. Tom text = hållet finns inte.
   *
   * Ett vägval bär sina egna namn; alla andra kort slår upp dem i tabellen.
   */
  private naming(response: Response): Naming {
    if (this.card.kind !== 'choice') {
      return NAMES[this.card.kind][response];
    }
    const label = this.card[response] ?? '';
    return { label, stamp: label.toUpperCase() };
  }

  /** Om kortet är ett vägval, med innehållet inskickat utifrån. */
  get choosing(): boolean {
    return this.card.kind === 'choice';
  }

  /** Om kortet är mintgrönt och inte gult. */
  get mint(): boolean {
    return this.card.kind === 'choice' && this.card.face === 'mint';
  }

  /** Vad kortet heter för den som inte ser det. */
  get ariaLabel(): string {
    if (this.card.kind === 'choice') {
      return this.card.label;
    }
    if (this.card.kind === 'ask') {
      return this.card.text;
    }
    return this.thinking
      ? `Vad betyder ${this.prompt}?`
      : `Stämmer ${this.prompt} = ${this.shown}?`;
  }

  /** Vad hållen heter. I återkalla är det den som övar som dömer sig själv. */
  get affirmLabel(): string {
    return this.naming('affirm').label;
  }

  get denyLabel(): string {
    return this.naming('deny').label;
  }

  /** Det tredje svaret. Om en själv är det «hoppa över», inte «vet ej». */
  get unsureLabel(): string {
    return this.naming('unsure').label;
  }

  /** Stämplarna är knapparnas ord i kortformat — de ska rymmas på kortet. */
  get affirmStamp(): string {
    return this.naming('affirm').stamp;
  }

  get denyStamp(): string {
    return this.naming('deny').stamp;
  }

  get unsureStamp(): string {
    return this.naming('unsure').stamp;
  }

  /** Om facit ska stå på kortet just nu. Ett påstående om en själv har inget. */
  get showsAnswer(): boolean {
    if (this.card.kind === 'ask' || this.card.kind === 'choice') {
      return false;
    }
    return this.card.kind === 'trueFalse' || this.phase !== 'asking';
  }

  // --- Dragning -------------------------------------------------------------

  dragMoved($event: CdkDragMove): void {
    // Rotationen ska följa hur långt kortet flyttats, inte var på skärmen
    // fingret råkar befinna sig.
    this.progress = swipeProgress($event.distance.x, window.innerWidth);
    this.down = downProgress($event.distance.y, window.innerHeight);

    const now = performance.now();
    this.samples.push({ x: $event.distance.x, y: $event.distance.y, t: now });
    if (this.samples.length > 5) {
      this.samples.shift();
    }
    if (this.path.length === 0) {
      this.dragStartedAt = now;
    }
    this.path.push([now - this.dragStartedAt, $event.distance.x, $event.distance.y]);
  }

  dragEnd($event: CdkDragEnd): void {
    const { x, y } = $event.distance;
    const response = commitsSwipe(x, y, this.samples, window.innerWidth, window.innerHeight);
    this.samples = [];

    // Varje drag loggas, också det som inte blev ett svar. Ett kort som dras
    // halvvägs och släpps är en tvekan, och tvekan syns ingen annanstans.
    const lasted = this.path.length === 0 ? 0 : performance.now() - this.dragStartedAt;
    this.tracker.log('drag', {
      // Hur länge kortet låg framme innan fingret började dra det, i ms.
      at: Math.round(Date.now() - this.startedAt - lasted),
      ms: Math.round(lasted),
      end: [Math.round(x), Math.round(y)],
      r: response,
      p: compactPath(this.path),
    });
    this.path = [];

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
      this.answer('affirm', 'key');
    } else if (event.key === 'ArrowLeft') {
      this.answer('deny', 'key');
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.answer('unsure', 'key');
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.reveal();
    }
    // ArrowUp lämnas obunden av samma skäl som gesten uppåt gör ingenting.
  }

  /** Svaret, oavsett om det kom som ett svep eller en piltangent. */
  answer(response: Response, via: 'swipe' | 'key' = 'swipe'): void {
    if (this.locked) {
      return;
    }
    if (this.naming(response).label === '') {
      // Hållet finns inte på det här kortet. En gest som inte betyder något
      // ska inte göra något — kortet fjädrar tillbaka.
      this.tracker.log('void', { r: response, via });
      this.progress = 0;
      this.down = 0;
      this.drag?.reset();
      return;
    }
    if (this.thinking) {
      // Ett svar innan facit visats är ändå ett svar: tiden är den som gått.
      this.reveal();
    }

    const seconds = this.secondsFor();
    const correct = this.wasCorrect(response);
    this.tracker.log('answer', {
      r: response,
      as: this.naming(response).label,
      via,
      s: seconds === null ? null : Math.round(seconds * 1000) / 1000,
      ok: correct,
    });
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

  /** Visar facit i återkalla. Den enda knappen kortet har kvar, och den är gömd. */
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
    if (this.card.kind === 'ask' || this.card.kind === 'choice') {
      // Inget att döma och inget att lära ut: svaret var sant för att den som
      // svarade sa det. En kvardröjande dom från kortet innan ska ändå bort.
      this.clear(this.verdictTimer);
      this.verdictTimer = null;
      this.verdict = undefined;
      return;
    }
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
    if (this.card.kind === 'choice') {
      // Ett vägval tar den tid det tar. Den tiden mäter ingenting.
      return null;
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

/** Kortet som loggen ska minnas det: vad som stod på det, och vad hållen hette. */
function describeCard(card: SwipeCard): Record<string, unknown> {
  if (card.kind === 'trueFalse') {
    const { asked, shown, truthy, direction } = card.statement;
    return { kind: 'word', asked, shown, truthy, dir: direction };
  }
  if (card.kind === 'ask') {
    return { kind: 'ask', text: card.text };
  }
  if (card.kind === 'choice') {
    return { kind: 'choice', label: card.label, right: card.affirm, left: card.deny, down: card.unsure };
  }
  return { kind: 'recall', asked: promptOf(card.word.pair, card.word.direction) };
}
