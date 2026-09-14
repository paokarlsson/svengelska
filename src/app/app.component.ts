import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SEED_BLOCK, WordPair } from './words/word-catalog';
import { TrainingEngine } from './training/training-engine';
import { STEPS, Step, WordState } from './training/word-state';

/** Vad ett tillstånd heter för den som tittar. */
const STATE_LABEL: Record<WordState, string> = {
  UNSEEN: 'Ny',
  MATCH: 'Match',
  TRUE_FALSE: 'Sant/falskt',
  RECALL: 'Återkalla',
  WRITTEN: 'Skriva',
  AUTOMATIC: 'Sitter',
};

const STEP_LABEL: Record<Step, string> = {
  match: 'Match',
  trueFalse: 'Sant/falskt',
  recall: 'Återkalla',
  written: 'Skriva',
};

/**
 * Skalet, tills sessionsdirigenten finns.
 *
 * Visar blocket och vad motorn anser om varje ord. Det är avsiktligt mer än en
 * platshållare och mindre än en meny: det enda som går att se innan någon vy
 * finns är att lagret, härledningen och motorn talar samma språk — och det är
 * precis vad den här sidan visar.
 *
 * Notera att det *inte* finns någon knapp som väljer övning. Konceptets
 * produktprincip är att läget är motorns beslut och inte användarens, och en
 * meny här hade varit det första steget bort från den.
 */
@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrl: 'app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  private readonly engine = inject(TrainingEngine);

  readonly block = SEED_BLOCK;
  readonly steps = STEPS;

  stateOf(pair: WordPair): string {
    return STATE_LABEL[this.engine.stateFor(pair)];
  }

  stepOf(pair: WordPair): string {
    const step = this.engine.stepFor(pair);
    return step === null ? '—' : STEP_LABEL[step];
  }

  stepLabel(step: Step): string {
    return STEP_LABEL[step];
  }

  masteredIn(step: Step): number {
    return this.engine.masteredCount(this.block.words, step);
  }

  get hasPractice(): boolean {
    return this.engine.hasPractice;
  }
}
