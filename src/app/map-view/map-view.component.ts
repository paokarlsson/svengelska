/**
 * Kartan: vad systemet anser om varje ord, åt vart och ett av hållen.
 *
 * Före grenen var det ett fält per steg. Nu är det **en rad per riktning**, och
 * det är inte kosmetik: det är den enda ytan där det går att se att
 * `hund → dog` släpar efter `dog → hund`, och det är precis vad testet vill
 * se. Att slå ihop dem till en rad vore att visa medelvärdet av två färdigheter
 * och kalla det en.
 *
 * Fyra toner och inte tre. `taught` — «inte lärt» — är hållet som fått «vet ej»
 * oftare än det fått fel, och det är skillnaden mellan ett ord som lärts in fel
 * och ett som aldrig lärts in. Åtgärden skiljer sig, och kartan är stället där
 * en människa kan se vilken som behövs.
 */
import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { TrainingEngine } from '../training/training-engine';
import { Mastery, StepStat, masteryIn } from '../training/word-state';
import { Direction, DirectedWord, WordBlock, WordPair } from '../words/word-catalog';

type Tone = 'unseen' | 'weak' | 'learning' | 'mastered' | 'taught';

interface Row {
  word: DirectedWord;
  asked: string;
  answer: string;
  label: string;
  tone: Tone;
}

interface Group {
  pair: WordPair;
  rows: readonly Row[];
  /** Ordet sitter när båda hållen gör det. */
  settled: boolean;
}

const TONE_LABEL: Record<Tone, string> = {
  unseen: 'ny',
  weak: 'svag',
  learning: 'övar',
  mastered: 'sitter',
  taught: 'inte lärt',
};

const DIRECTION_LABEL: Record<Direction, string> = {
  en: 'engelska → svenska',
  sv: 'svenska → engelska',
};

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

  groups: readonly Group[] = [];
  settled = 0;

  ngOnChanges(): void {
    this.groups = this.block.words.map((pair) => this.groupFor(pair));
    this.settled = this.groups.filter((group) => group.settled).length;
  }

  directionLabel(direction: Direction): string {
    return DIRECTION_LABEL[direction];
  }

  private groupFor(pair: WordPair): Group {
    const rows = (['en', 'sv'] as const).map((direction) => this.rowFor({ pair, direction }));
    return { pair, rows, settled: rows.every((row) => row.tone === 'mastered') };
  }

  private rowFor(word: DirectedWord): Row {
    const stat = this.engine.statFor(word);
    const tone = toneFor(stat);
    return {
      word,
      asked: word.direction === 'en' ? word.pair.en : word.pair.sv,
      answer: word.direction === 'en' ? word.pair.sv : word.pair.en,
      label: TONE_LABEL[tone],
      tone,
    };
  }
}

/**
 * Tonen ett håll får.
 *
 * `taught` går före domen och inte efter: ett håll där luckorna är fler än
 * felen är inte «svagt» i betydelsen fellärt, det är oövat. Att låta den tonen
 * ta över även från `learning` är avsiktligt — ett ord som svarats rätt några
 * gånger men fortfarande möts med «vet ej» lika ofta är inte på gång, det
 * gissas fram.
 */
function toneFor(stat: StepStat): Tone {
  if (stat.attempts === 0) {
    return 'unseen';
  }
  const unsure = stat.recent.filter((outcome) => outcome === 'unsure').length;
  const missed = stat.recent.filter((outcome) => outcome === 'miss').length;
  const mastery: Mastery = masteryIn(stat);
  if (mastery !== 'mastered' && unsure > missed && unsure > 0) {
    return 'taught';
  }
  return mastery;
}
