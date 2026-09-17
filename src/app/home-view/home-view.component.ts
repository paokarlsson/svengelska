/**
 * Startsidan: en vecka, en knapp och en inställning.
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
 */
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Output,
  inject,
} from '@angular/core';
import { MAX_NEW_PER_DAY } from '../services/progress-store';
import { TrainingEngine } from '../training/training-engine';
import { ALL_WORDS, WORD_BLOCKS, WordBlock, blockById } from '../words/word-catalog';

/** Ett block som det ser ut i veckoutfällningen. */
interface BlockCard {
  block: WordBlock;
  mastered: number;
  started: boolean;
}

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
  private readonly changes = inject(ChangeDetectorRef);

  askingReset = false;
  /** Om veckoutfällningen är öppen. */
  switching = false;
  /** Om inställningspanelen är öppen. */
  settingsOpen = false;

  readonly maxNewPerDay = MAX_NEW_PER_DAY;

  /** Veckan användaren bläddrat fram till, om någon. */
  private pickedId: string | null = null;

  /**
   * Veckan sidan öppnar i: alltid den sista i listan, alltså den nyaste i
   * CSV:n.
   *
   * Medvetet *inte* `activeBlockId`. Den som lägger in vecka 7 ska få vecka 7
   * nästa gång appen öppnas, utan att först behöva leta upp den.
   */
  get week(): WordBlock | null {
    return blockById(this.pickedId) ?? WORD_BLOCKS.at(-1) ?? null;
  }

  /** Listorna med sitt läge. Räknas om vid varje ändringsdetektering. */
  get cards(): BlockCard[] {
    return WORD_BLOCKS.map((block) => ({
      block,
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
    return this.engine.newWordsLeft(ALL_WORDS);
  }

  get hasPractice(): boolean {
    return this.engine.hasPractice;
  }

  get hasBlocks(): boolean {
    return WORD_BLOCKS.length > 0;
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

  async reset(): Promise<void> {
    await this.engine.reset();
    this.askingReset = false;
    // Det enda stället som behöver `markForCheck`: ett `await` ligger emellan,
    // så Angular har redan kört sin kontroll när svaret kommer.
    this.changes.markForCheck();
  }
}
