/**
 * Match: para ihop ord och översättning.
 *
 * Det första steget, och det enda som inte är ett kort i taget. Stödet här är
 * att alla svar syns — den som övar behöver känna igen kopplingen, inte plocka
 * fram den. Det är också vad som gör steget lätt att lura: uteslutning är en
 * riktig strategi, och den ska inte överleva till steg två. Därför är det bara
 * *här* som alla alternativ ligger framme.
 *
 * Kolumnerna deras-blandas (se `words/shuffle.ts`): ligger ett ord mitt emot
 * sin egen översättning är rundan avslöjad av raden.
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
  inject,
} from '@angular/core';
import { WordPair, wordKey } from '../words/word-catalog';
import { derange } from '../words/shuffle';
import { Answer } from '../training/session';

/** Hur länge en felträff står kvar innan valet släpps. */
const SHAKE_MS = 550;

/** Pausen efter sista paret, så att rundan hinner se färdig ut. */
const ROUND_END_MS = 650;

@Component({
  selector: 'app-match-view',
  templateUrl: 'match-view.component.html',
  styleUrl: 'match-view.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MatchViewComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) pairs!: readonly WordPair[];

  @Output() readonly answered = new EventEmitter<Answer>();
  @Output() readonly completed = new EventEmitter<void>();

  left: readonly WordPair[] = [];
  right: readonly WordPair[] = [];

  selectedEn: WordPair | null = null;
  selectedSv: WordPair | null = null;
  /** Nycklarna på de par som redan är ihopparade. */
  solved = new Set<string>();
  /** Sant medan en felträff visas — då tar kolumnerna inte emot tryck. */
  shaking = false;

  private readonly changes = inject(ChangeDetectorRef);
  /** Klockan startar om efter varje löst par: tiden mäts per par, inte per runda. */
  private since = Date.now();
  private timer: ReturnType<typeof setTimeout> | null = null;

  ngOnChanges(): void {
    this.clearTimer();
    this.left = [...this.pairs];
    this.right = derange(this.pairs);
    this.selectedEn = null;
    this.selectedSv = null;
    this.solved = new Set<string>();
    this.shaking = false;
    this.since = Date.now();
  }

  ngOnDestroy(): void {
    this.clearTimer();
  }

  key(pair: WordPair): string {
    return wordKey(pair);
  }

  isSolved(pair: WordPair): boolean {
    return this.solved.has(wordKey(pair));
  }

  chooseEn(pair: WordPair): void {
    if (this.shaking || this.isSolved(pair)) {
      return;
    }
    this.selectedEn = this.selectedEn === pair ? null : pair;
    this.settle();
  }

  chooseSv(pair: WordPair): void {
    if (this.shaking || this.isSolved(pair)) {
      return;
    }
    this.selectedSv = this.selectedSv === pair ? null : pair;
    this.settle();
  }

  /**
   * Två valda celler är ett svar.
   *
   * En felträff lagras på det *engelska* ordet: det är ordet frågan handlade
   * om, och att lägga missen även på svenskan hade straffat ett ord som ingen
   * ännu tagit ställning till.
   */
  private settle(): void {
    const en = this.selectedEn;
    const sv = this.selectedSv;
    if (en === null || sv === null) {
      return;
    }

    const seconds = (Date.now() - this.since) / 1000;
    this.since = Date.now();
    const correct = wordKey(en) === wordKey(sv);
    this.answered.emit({ pair: en, step: 'match', correct, seconds });

    if (correct) {
      this.solved.add(wordKey(en));
      this.selectedEn = null;
      this.selectedSv = null;
      if (this.solved.size === this.pairs.length) {
        this.timer = setTimeout(() => {
          this.timer = null;
          this.completed.emit();
          this.changes.markForCheck();
        }, ROUND_END_MS);
      }
      return;
    }

    this.shaking = true;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.shaking = false;
      this.selectedEn = null;
      this.selectedSv = null;
      this.changes.markForCheck();
    }, SHAKE_MS);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
