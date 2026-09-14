/**
 * Startsidan: välj vecka, och sätt igång.
 *
 * Det enda valet som finns i appen är *vilka ord* som ska övas — aldrig hur.
 * Skillnaden är inte formell: vilken lista veckans glosor står i vet den som
 * övar (eller en förälder), medan vilket steg ett enskilt ord ska övas i är en
 * mätning ingen människa ska behöva göra. Därför finns den här listan, och
 * därför finns ingen lägesmeny.
 */
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Output,
  inject,
} from '@angular/core';
import { TrainingEngine } from '../training/training-engine';
import { WORD_BLOCKS, WordBlock } from '../words/word-catalog';

/** Ett block som det ser ut på startsidan. */
interface BlockCard {
  block: WordBlock;
  automatic: number;
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

  /** Blocket som övades sist, för att kunna peka ut var man var. */
  get lastBlockId(): string | null {
    return this.engine.activeBlockId;
  }

  /**
   * Listorna med sitt läge.
   *
   * Räknas fram vid varje ändringsdetektering och inte i `ngOnInit`: sidan
   * visas igen när ett pass är slut, och då ska siffrorna vara de nya.
   */
  get cards(): BlockCard[] {
    return WORD_BLOCKS.map((block) => ({
      block,
      automatic: block.words.filter((pair) => this.engine.stepFor(pair) === null).length,
      started: block.words.some((pair) => this.engine.stateFor(pair) !== 'UNSEEN'),
    }));
  }

  get hasPractice(): boolean {
    return this.engine.hasPractice;
  }

  percent(card: BlockCard): number {
    return Math.round((card.automatic / card.block.words.length) * 100);
  }

  async reset(): Promise<void> {
    await this.engine.reset();
    this.askingReset = false;
    this.changes.markForCheck();
  }
}
