/**
 * Startsidan: listorna som en bunt kort.
 *
 * Ett tryck på kortet kör listan. Vänster och höger bläddrar, åt var sitt håll.
 * Ner låter appen skriva en ny. Raden under kortet säger samma sak och går att
 * trycka på.
 *
 * Så var det inte från början. Först hette höger «kör» och vänster «nästa
 * lista», eftersom höger är «ja» på ett gloskort. Loggen från första besöket
 * visade vad det kostade: vänster är «nästa» för den som bläddrar, och höger är
 * då «tillbaka» — så den som ville tillbaka till sin lista startade ett varv i
 * fel lista, och den som ville starta tryckte på kortet, fyra gånger, utan att
 * något hände. Ett kort man bläddrar bland ska bläddras åt båda hållen, och ett
 * kort man vill in i trycker man på.
 *
 * Två saker går inte att svepa, och de ligger därför under kortet i stället
 * för på det: fälten där man skriver ett önskemål eller klistrar in en nyckel,
 * och inställningarna. Ett textfält är ingen gest.
 *
 * Listan är källan till *nya* ord och ingen avgränsning av övningen:
 * repetitionen tar allt som setts, oavsett vilken lista det står i. Vilka ord
 * varvet innehåller är planens sak och ingen människas.
 *
 * Listorna kommer från två håll. Några följde med bygget; resten skriver appen
 * själv, efter ett önskemål eller efter det startrundan sa. Det kräver en
 * Anthropic-nyckel, och den lägger den som övar in här, eftersom appen inte har
 * någon server som kunde hålla en åt alla.
 */
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
  inject,
} from '@angular/core';
import { ApiKeyStore } from '../services/api-key-store';
import { buildExport, exportText } from '../services/data-export';
import { ListWriteError, WriteFailure } from '../services/list-write-error';
import { ListWriter } from '../services/list-writer';
import { ProfileStore } from '../services/profile-store';
import { BreakDeck } from '../services/break-deck';
import { Break } from '../intro/breaks';
import { LogStats, Tracker } from '../services/tracker';
import { MAX_NEW_PER_DAY } from '../services/progress-store';
import {
  ChoiceCard,
  SwipeAnswer,
  SwipeCard,
  SwipeViewComponent,
} from '../swipe-view/swipe-view.component';
import { TrainingEngine } from '../training/training-engine';
import { Response } from '../training/word-state';
import { WordBlock } from '../words/word-catalog';
import { WordLibrary } from '../words/word-library';

/** En lista som den ser ut på startsidan. */
interface BlockCard {
  block: WordBlock;
  mastered: number;
  started: boolean;
  /** Om listan kommit till här. Bara sådana går att ta bort. */
  own: boolean;
}

/** Så långt sidan ska vara rullad för att ett drag nedåt ska räknas som rullning. */
const SCROLLED_PX = 40;

/**
 * Vad den som väntade på en lista får veta när det inte blev någon.
 *
 * Varje rad säger vad som går att göra åt saken. Ett fel som bara säger att
 * något gick fel lämnar ett barn och en förälder med en knapp som inte funkar.
 */
const FAILURE_TEXT: Record<WriteFailure, string> = {
  'no-key': 'Lägg in en Anthropic-nyckel först.',
  'no-wish': 'Skriv vad du vill öva på.',
  'bad-key': 'Anthropic godtog inte nyckeln. Kontrollera att hela nyckeln kom med.',
  busy: 'Anthropic är upptaget just nu. Försök igen om en stund.',
  offline: 'Det gick inte att nå Anthropic. Kontrollera uppkopplingen.',
  refused: 'Det önskemålet gick inte att göra en lista av. Pröva ett annat.',
  unreadable: 'Svaret gick inte att göra en lista av. Försök igen.',
  failed: 'Det gick inte att skriva listan.',
};

@Component({
  selector: 'app-home-view',
  templateUrl: 'home-view.component.html',
  styleUrl: 'home-view.component.scss',
  imports: [SwipeViewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeViewComponent implements OnInit, OnDestroy {
  /**
   * Om «Ny lista» ska stå utfälld från början.
   *
   * Sant för den som just gjort startrundan: appen vet nu vad hen tycker om,
   * och nästa steg är att göra något av det.
   */
  @Input() offerList = false;

  @Output() readonly chosen = new EventEmitter<WordBlock>();
  @Output() readonly mapped = new EventEmitter<WordBlock>();
  /** Gör startrundan — första gången, eller om igen. */
  @Output() readonly intro = new EventEmitter<void>();
  /** Allt är nollställt. Appen börjar om med startrundan. */
  @Output() readonly restarted = new EventEmitter<void>();

  private readonly engine = inject(TrainingEngine);
  private readonly library = inject(WordLibrary);
  private readonly keys = inject(ApiKeyStore);
  private readonly writer = inject(ListWriter);
  private readonly profiles = inject(ProfileStore);
  private readonly tracker = inject(Tracker);
  private readonly changes = inject(ChangeDetectorRef);
  private readonly breaks = inject(BreakDeck);

  askingReset = false;
  /** Om inställningspanelen är öppen. */
  settingsOpen = false;
  /** Om panelen för en ny lista är öppen. */
  makerOpen = false;
  /** Sant medan appen väntar på en lista. */
  writing = false;
  /**
   * Avbrottet som ligger framme medan en lista skrivs, eller `null`.
   *
   * Väntan är femton, tjugo sekunder. Loggen visade dem gå åt till tre tryck
   * på en grå «Välj åt mig» — knappen var avstängd för att listan redan
   * skrevs, men det syntes inte. Nu ligger ett avbrott på bordet i stället,
   * och svaret byggs vidare på i nästa lista.
   */
  waitCard: SwipeCard | null = null;
  private waitItem: Break | null = null;
  /** Varför det inte blev någon lista, eller `null`. */
  writeError: string | null = null;
  /** Sant när sidan lämnats. Då startar en färdig lista inget varv. */
  private gone = false;

  readonly maxNewPerDay = MAX_NEW_PER_DAY;

  /**
   * Exporten, när den inte gick att kopiera.
   *
   * Urklipp kräver en säker sida och ett ja från webbläsaren, och får appen
   * inget av dem ska texten ändå gå att komma åt: då visas den i ett fält att
   * markera för hand.
   */
  exported: string | null = null;
  /** Vad som senast hamnade i urklipp, för beskedet bredvid knappen. */
  copied: 'data' | 'log' | null = null;
  /**
   * Loggens storlek, som den var när inställningarna öppnades.
   *
   * Ett fält och ingen getter: att räkna den är att serialisera hela loggen,
   * och det ska inte ske vid varje ändringsdetektering.
   */
  logStats: LogStats = { sessions: 0, events: 0, chars: 0 };

  /** Listan användaren bläddrat fram till, om någon. */
  private pickedId: string | null = null;

  /**
   * Kortet som ligger framme.
   *
   * Ett fält och ingen getter: ett nytt objekt vid varje ändringsdetektering
   * räknas som ett nytt kort och nollställer det under fingret. Ett nytt läggs
   * fram med `deal()`, och bara då.
   */
  deck: ChoiceCard = this.cardFor(null);
  /** Hållet kortet sveptes åt. Verkställs när kortet lämnat bordet. */
  private swiped: Response | null = null;

  /**
   * Panelen för en ny lista, när den finns.
   *
   * En sättare och inte ett fält: panelen ritas först efter att `makerOpen`
   * blivit sann, och det är i den stunden den ska rullas fram.
   */
  @ViewChild('maker') set makerPanel(panel: ElementRef<HTMLElement> | undefined) {
    if (panel !== undefined && this.revealMaker) {
      this.revealMaker = false;
      // Panelen ligger under kortet, och på en telefon är det under kanten.
      // Loggen visade «Ny lista» svepas två gånger i rad av någon som inte såg
      // att den första redan hade öppnat den.
      panel.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
  private revealMaker = false;

  ngOnInit(): void {
    this.makerOpen = this.offerList;
    this.revealMaker = this.offerList;
    this.deal();
    // Startrundan är klar och nyckeln finns: då är det startrundans svar som
    // väljer de första orden, utan att någon behöver trycka på något.
    if (this.offerList && this.hasKey && this.hasProfile) {
      void this.surprise();
    }
  }

  ngOnDestroy(): void {
    this.gone = true;
  }

  /** Öppnar panelen för en ny lista och rullar fram den. */
  private openMaker(): void {
    if (this.makerOpen) {
      // Redan öppen: sättaren körs inte igen, så rulla dit för hand.
      document.querySelector('.maker')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    this.revealMaker = true;
    this.makerOpen = true;
  }

  /** Lägger fram kortet för listan som är aktuell nu. */
  private deal(): void {
    this.deck = this.cardFor(this.list);
  }

  private cardFor(list: WordBlock | null): ChoiceCard {
    // Med en enda lista finns inget att bläddra till.
    const several = this.library.blocks.length > 1;
    return {
      kind: 'choice',
      label: list === null ? 'Ingen lista' : `Listan ${list.name}. Tryck för att köra.`,
      // Hållen heter efter vad som kommer fram, inte efter vart fingret går:
      // ett drag åt vänster drar fram nästa kort i bunten.
      affirm: several ? 'Förra' : null,
      deny: several ? 'Nästa' : null,
      unsure: 'Ny lista',
      paging: true,
    };
  }

  onSwipe(answer: SwipeAnswer): void {
    this.swiped = answer.response;
  }

  /**
   * Kortet har lämnat bordet: nu händer det hållet betydde.
   *
   * Här och inte i `onSwipe()`, så att kortet hinner fara iväg innan sidan
   * byts under det.
   */
  onLanded(): void {
    const swiped = this.swiped;
    this.swiped = null;
    if (swiped === 'affirm') {
      this.browse(-1);
    } else if (swiped === 'deny') {
      this.browse(1);
    } else if (swiped === 'unsure') {
      this.pulledDown();
    }
  }

  /**
   * Kortet drogs nedåt.
   *
   * Det betyder «ny lista» — utom när sidan är rullad. Kortet tar hela fingret
   * för att kunna svepas, så sidan går inte att rulla med fingret på det, och
   * ett drag nedåt är då den som försöker rulla tillbaka upp. Loggen visade
   * just det: ett snabbt drag efter att inställningarna lästs, som öppnade en
   * panel ingen bett om. Är sidan rullad får draget därför det det ville.
   */
  private pulledDown(): void {
    if (window.scrollY > SCROLLED_PX) {
      this.tracker.log('scrollup', { from: Math.round(window.scrollY) });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      this.openMaker();
    }
    this.deal();
  }

  /** Bläddrar ett steg i bunten, runt åt båda hållen. */
  private browse(step: 1 | -1): void {
    const blocks = this.library.blocks;
    const at = blocks.findIndex((block) => block.id === this.list?.id);
    this.pickedId = blocks[(at + step + blocks.length) % blocks.length]?.id ?? null;
    this.deal();
  }

  /** Var i bunten listan ligger, räknat från ett. */
  get position(): number {
    return this.library.blocks.findIndex((block) => block.id === this.list?.id) + 1;
  }

  get count(): number {
    return this.library.blocks.length;
  }

  /** De egna listorna, för den som vill ta bort en. */
  get ownLists(): readonly WordBlock[] {
    return this.library.blocks.filter((block) => this.library.isOwn(block.id));
  }

  /**
   * Listan sidan öppnar i: den man övade sist.
   *
   * Finns den inte — första besöket, eller en lista som tagits bort — blir det
   * den sista, alltså den som senast kom till.
   */
  get list(): WordBlock | null {
    return (
      this.library.byId(this.pickedId) ??
      this.library.byId(this.engine.activeBlockId) ??
      this.library.blocks.at(-1) ??
      null
    );
  }

  /** Listorna med sitt läge. Räknas om vid varje ändringsdetektering. */
  get cards(): BlockCard[] {
    return this.library.blocks.map((block) => ({
      block,
      own: this.library.isOwn(block.id),
      mastered: this.engine.masteredCount(block.words),
      started: block.words.some((pair) =>
        (['en', 'sv'] as const).some(
          (direction) => this.engine.stateFor({ pair, direction }) !== 'UNSEEN',
        ),
      ),
    }));
  }

  get card(): BlockCard | null {
    const list = this.list;
    return list === null ? null : (this.cards.find((item) => item.block.id === list.id) ?? null);
  }

  /** Om dagsbudgeten gäller. Av tills vidare; då syns den inte heller. */
  get limited(): boolean {
    return this.engine.limitNewWords;
  }

  get newWordsPerDay(): number {
    return this.engine.settings.newWordsPerDay;
  }

  /** Hur många nya ord dagen har kvar. Härlett, aldrig bokfört. */
  get newWordsLeft(): number {
    return this.engine.newWordsLeft(this.library.words);
  }

  get hasPractice(): boolean {
    return this.engine.hasPractice;
  }

  get hasBlocks(): boolean {
    return this.library.blocks.length > 0;
  }

  percent(card: BlockCard): number {
    return Math.round((card.mastered / card.block.words.length) * 100);
  }

  setNewWordsPerDay(value: string): void {
    this.engine.setNewWordsPerDay(Number.parseInt(value, 10));
    this.tracker.log('setting', { newWordsPerDay: this.newWordsPerDay });
  }

  toggleSettings(): void {
    this.settingsOpen = !this.settingsOpen;
    if (this.settingsOpen) {
      this.logStats = this.tracker.stats();
    }
  }

  /** Om loggen är på. Se `tracker.ts` för vad den sparar och inte sparar. */
  get tracking(): boolean {
    return this.tracker.enabled;
  }

  setTracking(on: boolean): void {
    this.tracker.enabled = on;
    this.logStats = this.tracker.stats();
  }

  /** Loggens storlek i kilobyte, avrundat uppåt så att «0 kB» betyder tom. */
  get logKb(): number {
    return Math.ceil(this.logStats.chars / 1000);
  }

  /** Kopierar hela loggen. Den kan vara stor — filen är ofta ett bättre val. */
  async copyLog(): Promise<void> {
    await this.copy(JSON.stringify(this.tracker.export()), 'log');
  }

  /**
   * Sparar data och logg i en fil.
   *
   * En fil och inte två: den som ska analysera behöver båda, och loggens
   * händelser pekar på ord vars läge står i datat. En fil går också att bifoga
   * där en inklistrad text hade varit för lång.
   */
  saveFile(): void {
    const now = Date.now();
    const content = JSON.stringify({
      data: buildExport(this.exportSources(now)),
      log: this.tracker.export(now),
    });
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `svengelska-${new Date(now).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(url);
    this.tracker.log('export', { what: 'file', chars: content.length });
  }

  clearLog(): void {
    this.tracker.clear();
    this.logStats = this.tracker.stats();
  }

  start(): void {
    const list = this.list;
    if (list !== null) {
      this.chosen.emit(list);
    }
  }

  get hasKey(): boolean {
    return this.keys.hasKey;
  }

  /** Nyckelns sista tecken, så att det syns vilken som ligger inne. */
  get keyHint(): string | null {
    return this.keys.hint;
  }

  saveKey(value: string): void {
    this.writeError = this.keys.save(value) ? null : FAILURE_TEXT['no-key'];
    // Kom man hit från startrundan var nyckeln det enda som saknades.
    if (this.writeError === null && this.offerList && this.hasProfile) {
      void this.surprise();
    }
  }

  forgetKey(): void {
    this.keys.clear();
  }

  /** Om startrundan är gjord. Då kan appen välja tema själv. */
  get hasProfile(): boolean {
    return this.profiles.hasProfile;
  }

  /** Svaret på ett avbrott medan listan skrivs. */
  onWaitAnswer(answer: SwipeAnswer): void {
    if (this.waitItem === null) {
      return;
    }
    const note = this.breaks.answer(this.waitItem, answer.response);
    this.tracker.log('break', { ...this.waitItem, as: note?.answer ?? null, waiting: true });
  }

  /** Avbrottet har lämnat bordet. Skrivs listan fortfarande kommer ett till. */
  onWaitLanded(): void {
    if (this.writing) {
      this.nextWaitCard();
    }
  }

  private nextWaitCard(): void {
    this.waitItem = this.breaks.peek();
    this.waitCard = this.waitItem === null ? null : { kind: 'ask', text: this.waitItem.text };
  }

  /** Låter appen välja temat, efter det startrundan sa. */
  surprise(): Promise<void> {
    return this.write('');
  }

  /**
   * Ber appen skriva en lista, sparar den och kör den.
   *
   * Orden visas inte först. Så var det förut — ett utkast att läsa och behålla
   * — men valet av ord är appens sak och ska ligga under ytan, precis som
   * repetitionsplanen. Den som vill se dem efteråt har kartan.
   *
   * Listan sparas även om sidan lämnats medan den skrevs. Loggen visade en
   * lista som kom fram arton sekunder efter att panelen stängts, mitt i ett
   * varv, och försvann: anropet var betalt och ingen fick se resultatet. Nu
   * hamnar den först i bunten, och är sidan kvar sätter den igång direkt.
   *
   * Ett tomt önskemål är tillåtet: för den som gjort startrundan betyder det
   * «välj åt mig», och för den som inte gjort det säger motorn ifrån.
   */
  async write(wish: string): Promise<void> {
    if (this.writing) {
      return;
    }
    this.writing = true;
    this.writeError = null;
    // Panelen stängs: väntan syns på bordet, där kortet brukar ligga, och
    // panelens knappar har inget att göra förrän listan finns.
    this.makerOpen = false;
    this.nextWaitCard();
    window.scrollTo?.({ top: 0, behavior: 'smooth' });
    const began = Date.now();
    // Önskemålet loggas — det är vad någon bad om, och det behövs för att
    // förstå vad som kom tillbaka. Nyckeln står i ett annat fält och loggas aldrig.
    this.tracker.log('list.ask', { wish: wish.trim().slice(0, 400), auto: wish.trim() === '' });
    try {
      const block = await this.writer.write(wish);
      this.tracker.log('list.got', {
        ms: Date.now() - began,
        name: block.name,
        words: block.words.map((pair) => `${pair.en}=${pair.sv}`),
      });
      this.library.add(block);
      this.tracker.log('list.keep', { id: block.id, started: !this.gone });
      if (this.gone) {
        // Nästa besök på startsidan öppnar på den nya listan.
        this.engine.setActiveBlock(block.id);
      } else {
        this.pickedId = block.id;
        this.makerOpen = false;
        this.deal();
        this.chosen.emit(block);
      }
    } catch (error) {
      this.writeError = failureText(error);
      // Felet står i panelen, så den öppnas igen.
      this.makerOpen = true;
      this.tracker.log('list.failed', {
        ms: Date.now() - began,
        why: error instanceof ListWriteError ? error.reason : 'failed',
      });
    } finally {
      this.writing = false;
      this.waitCard = null;
      this.waitItem = null;
      // Ett `await` ligger emellan, så Angular har redan kört sin kontroll.
      this.changes.markForCheck();
    }
  }

  /** Tar bort en egen lista. Framstegen ligger kvar — de följer ordet. */
  remove(block: WordBlock): void {
    this.library.remove(block.id);
    if (this.pickedId === block.id) {
      this.pickedId = null;
    }
    this.deal();
  }

  /**
   * Kopierar allt appen vet — utom nyckeln — som en text att klistra in för
   * analys. Vad som följer med avgör `data-export.ts`.
   */
  async exportData(): Promise<void> {
    await this.copy(exportText(this.exportSources(Date.now())), 'data');
  }

  private exportSources(now: number) {
    return {
      document: this.engine.snapshot,
      profile: this.profiles.profile,
      blocks: this.library.blocks,
      isOwn: (id: string) => this.library.isOwn(id),
      now,
    };
  }

  /** Lägger texten i urklipp, eller i ett fält att markera om det inte går. */
  private async copy(text: string, what: 'data' | 'log'): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.copied = what;
      this.exported = null;
    } catch {
      this.copied = null;
      this.exported = text;
    }
    this.tracker.log('export', { what, chars: text.length });
    this.changes.markForCheck();
  }

  /**
   * Börjar om från början: framstegen, profilen och de egna listorna.
   *
   * Nyckeln får ligga kvar — den är inte en del av vad appen vet om någon,
   * utan vad som låter den skriva listor, och att klistra in den igen är det
   * jobbigaste steget av alla. Loggen får också ligga kvar: den är till för
   * den som utvecklar appen, och omstarten är något den ska kunna se.
   *
   * Här fanns förut bara «Nollställ framstegen». Loggen visade den följas av
   * «Gör om startfrågorna», medan profilen, listan om mjöl och deg och
   * följdfrågornas svar låg kvar från förra gången.
   */
  async reset(): Promise<void> {
    this.tracker.log('reset', {});
    await this.engine.reset();
    this.profiles.clear();
    this.library.clearOwn();
    this.breaks.forget();
    this.pickedId = null;
    this.askingReset = false;
    this.restarted.emit();
    // Ett `await` ligger emellan, så Angular har redan kört sin kontroll.
    this.changes.markForCheck();
  }
}

function failureText(error: unknown): string {
  if (!(error instanceof ListWriteError)) {
    return FAILURE_TEXT.failed;
  }
  const text = FAILURE_TEXT[error.reason];
  // Anthropics eget besked säger ofta precis vad som är fel — slut på krediter,
  // en modell kontot saknar — och det ska den som äger nyckeln få läsa.
  return error.detail === null ? text : `${text} Anthropic svarade: ${error.detail}`;
}
