/**
 * Startsidan: en lista som ett kort, och tre håll att svepa det åt.
 *
 * Höger kör ett varv. Vänster bläddrar till nästa lista. Ner låter appen skriva
 * en ny. Det finns ingen startknapp och ingen lista att fälla ut — sidan är
 * samma föremål som resten av appen, och den som kan svara på ett kort kan
 * hitta hit och härifrån.
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
  EventEmitter,
  Input,
  OnInit,
  Output,
  inject,
} from '@angular/core';
import { ApiKeyStore } from '../services/api-key-store';
import { buildExport, exportText } from '../services/data-export';
import { ListWriteError, WriteFailure } from '../services/list-write-error';
import { ListWriter } from '../services/list-writer';
import { ProfileStore } from '../services/profile-store';
import { LogStats, Tracker } from '../services/tracker';
import { MAX_NEW_PER_DAY } from '../services/progress-store';
import {
  ChoiceCard,
  SwipeAnswer,
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
export class HomeViewComponent implements OnInit {
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

  private readonly engine = inject(TrainingEngine);
  private readonly library = inject(WordLibrary);
  private readonly keys = inject(ApiKeyStore);
  private readonly writer = inject(ListWriter);
  private readonly profiles = inject(ProfileStore);
  private readonly tracker = inject(Tracker);
  private readonly changes = inject(ChangeDetectorRef);

  askingReset = false;
  /** Om inställningspanelen är öppen. */
  settingsOpen = false;
  /** Om panelen för en ny lista är öppen. */
  makerOpen = false;
  /** Sant medan appen väntar på en lista. */
  writing = false;
  /** Varför det inte blev någon lista, eller `null`. */
  writeError: string | null = null;
  /**
   * Listan som just skrivits och ännu inte sparats.
   *
   * Den visas innan den hamnar bland de andra. Orden kommer från en modell och
   * ska övas av ett barn, och den som bad om dem ska hinna läsa dem först.
   */
  draft: WordBlock | null = null;

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

  ngOnInit(): void {
    this.makerOpen = this.offerList;
    this.deal();
  }

  /** Lägger fram kortet för listan som är aktuell nu. */
  private deal(): void {
    this.deck = this.cardFor(this.list);
  }

  private cardFor(list: WordBlock | null): ChoiceCard {
    return {
      kind: 'choice',
      label: list === null ? 'Ingen lista' : `Listan ${list.name}`,
      affirm: list === null ? null : 'Kör',
      // Med en enda lista finns inget att bläddra till.
      deny: this.library.blocks.length > 1 ? 'Nästa lista' : null,
      unsure: 'Ny lista',
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
      this.start();
    } else if (swiped === 'deny') {
      this.next();
    } else if (swiped === 'unsure') {
      this.makerOpen = true;
      this.deal();
    }
  }

  /** Bläddrar till nästa lista, runt till den första efter den sista. */
  private next(): void {
    const blocks = this.library.blocks;
    const at = blocks.findIndex((block) => block.id === this.list?.id);
    this.pickedId = blocks[(at + 1) % blocks.length]?.id ?? null;
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
  }

  forgetKey(): void {
    this.keys.clear();
  }

  /** Om startrundan är gjord. Då kan appen välja tema själv. */
  get hasProfile(): boolean {
    return this.profiles.hasProfile;
  }

  /** Låter appen välja temat, efter det startrundan sa. */
  surprise(): Promise<void> {
    return this.write('');
  }

  /**
   * Ber appen skriva en lista. Resultatet läggs fram som utkast, inte sparat.
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
    this.draft = null;
    const began = Date.now();
    // Önskemålet loggas — det är vad någon bad om, och det behövs för att
    // förstå vad som kom tillbaka. Nyckeln står i ett annat fält och loggas aldrig.
    this.tracker.log('list.ask', { wish: wish.trim().slice(0, 400), auto: wish.trim() === '' });
    try {
      this.draft = await this.writer.write(wish);
      this.tracker.log('list.got', {
        ms: Date.now() - began,
        name: this.draft.name,
        words: this.draft.words.map((pair) => `${pair.en}=${pair.sv}`),
      });
    } catch (error) {
      this.writeError = failureText(error);
      this.tracker.log('list.failed', {
        ms: Date.now() - began,
        why: error instanceof ListWriteError ? error.reason : 'failed',
      });
    } finally {
      this.writing = false;
      // Ett `await` ligger emellan, så Angular har redan kört sin kontroll.
      this.changes.markForCheck();
    }
  }

  /** Behåller utkastet: listan sparas och ligger framme på startsidan. */
  keepDraft(): void {
    if (this.draft === null) {
      return;
    }
    this.library.add(this.draft);
    this.tracker.log('list.keep', { id: this.draft.id });
    this.pickedId = this.draft.id;
    this.draft = null;
    this.makerOpen = false;
    this.deal();
  }

  dropDraft(): void {
    this.tracker.log('list.drop', { name: this.draft?.name ?? null });
    this.draft = null;
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

  async reset(): Promise<void> {
    await this.engine.reset();
    this.askingReset = false;
    // Det enda stället som behöver `markForCheck`: ett `await` ligger emellan,
    // så Angular har redan kört sin kontroll när svaret kommer.
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
