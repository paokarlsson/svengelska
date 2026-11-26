/**
 * Startsidan: en lista, en knapp, en inställning — och vägen till en ny lista.
 *
 * Vad som väljs här är sådant som *den som övar vet bättre än appen*. Vilken
 * lista veckans glosor står i vet ett barn eller en förälder. Hur fort det ska
 * gå framåt vet de också — ett barn som ligger efter en vecka behöver kunna
 * sätta noll nya ord och bara repetera, och ett barn som har förhör på fredag
 * behöver kunna sätta tio utan att någon rör i koden.
 *
 * Vad som inte finns är en ingångsväljare. Grenen spelar ett enda steg, och en
 * dörr är inget val. Vilka ord varvet innehåller är planens sak och ingen
 * människas.
 *
 * Veckan är källan till *nya* ord och ingen avgränsning av övningen:
 * repetitionen tar allt som setts, oavsett vilken vecka det står i.
 *
 * Listorna kommer från två håll. Några följde med bygget; resten skriver appen
 * själv, efter ett önskemål — ett tema, eller veckans läxa inklistrad. Det
 * kräver en Anthropic-nyckel, och den lägger den som övar in här, eftersom
 * appen inte har någon server som kunde hålla en åt alla.
 */
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Output,
  inject,
} from '@angular/core';
import { ApiKeyStore } from '../services/api-key-store';
import { ListWriteError, WriteFailure } from '../services/list-write-error';
import { ListWriter } from '../services/list-writer';
import { MAX_NEW_PER_DAY } from '../services/progress-store';
import { TrainingEngine } from '../training/training-engine';
import { WordBlock } from '../words/word-catalog';
import { WordLibrary } from '../words/word-library';

/** Ett block som det ser ut i veckoutfällningen. */
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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeViewComponent {
  @Output() readonly chosen = new EventEmitter<WordBlock>();
  @Output() readonly mapped = new EventEmitter<WordBlock>();

  private readonly engine = inject(TrainingEngine);
  private readonly library = inject(WordLibrary);
  private readonly keys = inject(ApiKeyStore);
  private readonly writer = inject(ListWriter);
  private readonly changes = inject(ChangeDetectorRef);

  askingReset = false;
  /** Om veckoutfällningen är öppen. */
  switching = false;
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

  /** Veckan användaren bläddrat fram till, om någon. */
  private pickedId: string | null = null;

  /**
   * Veckan sidan öppnar i: alltid den sista i listan, alltså den nyaste i
   * CSV:n.
   *
   * Medvetet *inte* `activeBlockId`. Den som lägger in vecka 7 ska få vecka 7
   * nästa gång appen öppnas, utan att först behöva leta upp den. Detsamma
   * gäller en lista appen skrivit: egna listor ligger sist, så den nyaste är
   * den som öppnas.
   */
  get week(): WordBlock | null {
    return this.library.byId(this.pickedId) ?? this.library.blocks.at(-1) ?? null;
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
    const week = this.week;
    return week === null ? null : (this.cards.find((item) => item.block.id === week.id) ?? null);
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
  }

  /** Väljer en vecka ur utfällningen — startar den inte. En startväg räcker. */
  pick(block: WordBlock): void {
    this.pickedId = block.id;
    this.switching = false;
  }

  start(): void {
    const week = this.week;
    if (week !== null) {
      this.chosen.emit(week);
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

  /** Ber appen skriva en lista. Resultatet läggs fram som utkast, inte sparat. */
  async write(wish: string): Promise<void> {
    if (this.writing || wish.trim().length === 0) {
      return;
    }
    this.writing = true;
    this.writeError = null;
    this.draft = null;
    try {
      this.draft = await this.writer.write(wish);
    } catch (error) {
      this.writeError = failureText(error);
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
    this.pickedId = this.draft.id;
    this.draft = null;
    this.makerOpen = false;
  }

  dropDraft(): void {
    this.draft = null;
  }

  /** Tar bort en egen lista. Framstegen ligger kvar — de följer ordet. */
  remove(block: WordBlock): void {
    this.library.remove(block.id);
    if (this.pickedId === block.id) {
      this.pickedId = null;
    }
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
