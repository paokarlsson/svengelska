/**
 * Kartan: vad systemet anser om varje ord, steg för steg.
 *
 * Inte `ganger`:s triangel — den formen finns bara för att 7 × 8 och 8 × 7 är
 * samma tal, och ordpar har ingen sådan symmetri att rita. Här är det en lista
 * med ett fält per steg, alltså precis den tabell konceptet skissar:
 *
 *     dog → hund    match: sitter  sant/falskt: sitter  återkalla: övar  skriva: svag
 *
 * Färgen mäts alltid mot *stegets egen* tröskel, och det kommer gratis:
 * `masteryIn()` dömer på kvoter mot stegets baslinje, inte på sekunder. Ett
 * grönt fält betyder därför samma sak i alla fyra kolumnerna, fast ett svep
 * och ett skrivet svar ligger på olika tidsskalor.
 */
import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { TrainingEngine } from '../training/training-engine';
import { STEPS, Step, WordState, masteryIn } from '../training/word-state';
import { WordBlock, WordPair } from '../words/word-catalog';

/** Vad ett fält säger, och hur det ska läsas. */
interface Cell {
  step: Step;
  label: string;
  tone: 'unseen' | 'weak' | 'learning' | 'mastered';
}

interface Row {
  pair: WordPair;
  cells: readonly Cell[];
  automatic: boolean;
}

const STEP_LABEL: Record<Step, string> = {
  match: 'Match',
  trueFalse: 'Sant/falskt',
  recall: 'Återkalla',
  written: 'Skriva',
};

const STATE_LABEL: Record<WordState, string> = {
  UNSEEN: 'Ny',
  MATCH: 'Match',
  TRUE_FALSE: 'Sant/falskt',
  RECALL: 'Återkalla',
  WRITTEN: 'Skriva',
  AUTOMATIC: 'Sitter',
};

const TONE_LABEL = {
  unseen: 'ny',
  weak: 'svag',
  learning: 'övar',
  mastered: 'sitter',
} as const;

@Component({
  selector: 'app-map-view',
  templateUrl: 'map-view.component.html',
  styleUrl: 'map-view.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapViewComponent implements OnChanges {
  @Input({ required: true }) block!: WordBlock;

  @Output() readonly back = new EventEmitter<void>();

  private readonly engine = inject(TrainingEngine);

  rows: readonly Row[] = [];
  automatic = 0;

  ngOnChanges(): void {
    this.rows = this.block.words.map((pair) => this.rowFor(pair));
    this.automatic = this.rows.filter((row) => row.automatic).length;
  }

  stepLabel(step: Step): string {
    return STEP_LABEL[step];
  }

  readonly steps = STEPS;

  /** Etiketten för ordet som helhet — härledd, precis som fälten. */
  stateOf(pair: WordPair): string {
    return STATE_LABEL[this.engine.stateFor(pair)];
  }

  private rowFor(pair: WordPair): Row {
    const record = this.engine.recordFor(pair);
    const cells = STEPS.map((step): Cell => {
      const stat = record[step];
      const tone = stat.attempts === 0 ? 'unseen' : masteryIn(stat);
      return { step, label: TONE_LABEL[tone], tone };
    });
    return { pair, cells, automatic: this.engine.stepFor(pair) === null };
  }
}
