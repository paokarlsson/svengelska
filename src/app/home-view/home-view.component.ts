/**
 * Startsidan: en vecka, en ingång, och sätt igång.
 *
 * Två val finns här, och båda är sådana som *den som övar vet bättre än appen*.
 * Vilken lista veckans glosor står i vet ett barn eller en förälder. Och var
 * veckan ska börja vet den också: att listan redan gåtts igenom på måndagen
 * står inte i framstegsdokumentet.
 *
 * Vad som fortfarande *inte* finns är en lägesmeny. Ingången gäller det första
 * kortet; vilket steg ett enskilt ord ska övas i därefter är en mätning, och
 * den ska ingen människa behöva göra. Se «Ingången är användarens, stegen är
 * motorns» i docs/plan.md.
 */
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Output,
  inject,
} from '@angular/core';
import { EntryChoice, EntryPickerComponent } from '../entry-picker/entry-picker.component';
import { DEFAULT_ENTRY, ENTRY_OPTIONS } from '../training/entry';
import { TrainingEngine } from '../training/training-engine';
import { Step } from '../training/word-state';
import { WORD_BLOCKS, WordBlock, blockById } from '../words/word-catalog';

/** Ett block som det ser ut i veckoutfällningen. */
interface BlockCard {
  block: WordBlock;
  automatic: number;
  started: boolean;
}

/** Vad ett tryck på «Kör igång» bär med sig. */
export interface Start {
  block: WordBlock;
  entry: Step;
}

@Component({
  selector: 'app-home-view',
  templateUrl: 'home-view.component.html',
  styleUrl: 'home-view.component.scss',
  imports: [EntryPickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeViewComponent {
  @Output() readonly chosen = new EventEmitter<Start>();
  @Output() readonly mapped = new EventEmitter<WordBlock>();

  private readonly engine = inject(TrainingEngine);
  private readonly changes = inject(ChangeDetectorRef);

  askingReset = false;
  /** Om veckoutfällningen är öppen. */
  switching = false;
  entry: Step = DEFAULT_ENTRY;

  /** Veckan användaren bläddrat fram till, om någon. */
  private pickedId: string | null = null;

  /**
   * Veckan sidan öppnar i: alltid den sista i listan, alltså den nyaste i
   * CSV:n.
   *
   * Medvetet *inte* `activeBlockId`. Den som lägger in vecka 7 ska få vecka 7
   * nästa gång appen öppnas, utan att först behöva leta upp den — och den som
   * övade vecka 3 i går gjorde det troligen för att veckan var ny då.
   */
  get week(): WordBlock | null {
    return blockById(this.pickedId) ?? WORD_BLOCKS.at(-1) ?? null;
  }

  /**
   * Veckans fyra ingångar med sitt lås.
   *
   * En getter och inget fält: sidan visas igen när ett pass är slut, och då kan
   * Skriva ha låsts upp. Vyn räknar ingen tröskel själv — `requires` är regeln
   * och `engine.reached()` är mätningen.
   */
  get entries(): EntryChoice[] {
    const week = this.week;
    return ENTRY_OPTIONS.map((option) => ({
      ...option,
      locked:
        week === null ||
        (option.requires !== null && !this.engine.reached(week.words, option.requires)),
    }));
  }

  /** Listorna med sitt läge. Räknas om vid varje ändringsdetektering, se ovan. */
  get cards(): BlockCard[] {
    return WORD_BLOCKS.map((block) => ({
      block,
      automatic: block.words.filter((pair) => this.engine.stepFor(pair) === null).length,
      started: block.words.some((pair) => this.engine.stateFor(pair) !== 'UNSEEN'),
    }));
  }

  get card(): BlockCard | null {
    const week = this.week;
    return week === null ? null : (this.cards.find((card) => card.block.id === week.id) ?? null);
  }

  get hasPractice(): boolean {
    return this.engine.hasPractice;
  }

  get hasBlocks(): boolean {
    return WORD_BLOCKS.length > 0;
  }

  percent(card: BlockCard): number {
    return Math.round((card.automatic / card.block.words.length) * 100);
  }

  /** Väljer en vecka ur utfällningen — startar den inte. En startväg räcker. */
  pick(block: WordBlock): void {
    this.pickedId = block.id;
    this.switching = false;
    // Den nya veckan kan ha Skriva låst medan den förra hade det upplåst. Att
    // låta ett låst steg ligga kvar valt vore att kunna starta i det.
    if (this.entries.some((option) => option.step === this.entry && option.locked)) {
      this.entry = DEFAULT_ENTRY;
    }
  }

  choose(entry: Step): void {
    this.entry = entry;
  }

  start(): void {
    const week = this.week;
    if (week !== null) {
      this.chosen.emit({ block: week, entry: this.entry });
    }
  }

  async reset(): Promise<void> {
    await this.engine.reset();
    this.askingReset = false;
    this.entry = DEFAULT_ENTRY;
    // Det enda stället som behöver `markForCheck`: ett `await` ligger emellan,
    // så Angular har redan kört sin kontroll när svaret kommer. Utfällningen
    // och ingångsvalet klarar sig utan, eftersom de ändras från ett (click) i
    // den här komponentens egen mall.
    this.changes.markForCheck();
  }
}
