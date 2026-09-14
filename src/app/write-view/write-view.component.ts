/**
 * Skriva: fri produktion, och det enda steget som mäter stavning.
 *
 * Här finns inget stöd kvar — inga alternativ, ingen igenkänning, bara ordet
 * och ett tomt fält. Det är därför `word-state.ts` kräver att just det här
 * steget sitter innan en glosa räknas som automatiserad: allt annat mäter att
 * kopplingen känns igen, inte att den går att plocka fram.
 *
 * Ett nästan rätt svar får sin egen återkoppling men räknas som fel i domen —
 * se `training/spelling.ts` för varför, och för vad som skulle krävas för att
 * göra det till något annat.
 */
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  ViewChild,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { WordPair } from '../words/word-catalog';
import { Verdict, judge } from '../training/spelling';
import { Answer } from '../training/session';

/** Hur länge ett rätt svar får stå kvar innan nästa ord. */
const CORRECT_MS = 750;

@Component({
  selector: 'app-write-view',
  templateUrl: 'write-view.component.html',
  styleUrl: 'write-view.component.scss',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WriteViewComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input({ required: true }) pair!: WordPair;

  @Output() readonly answered = new EventEmitter<Answer>();
  @Output() readonly completed = new EventEmitter<void>();

  @ViewChild('field') private field?: ElementRef<HTMLInputElement>;

  typed = '';
  /** Domen, eller `null` så länge ordet är obesvarat. */
  verdict: Verdict | null = null;

  private readonly changes = inject(ChangeDetectorRef);
  private startedAt = Date.now();
  private timer: ReturnType<typeof setTimeout> | null = null;

  ngOnChanges(): void {
    this.clearTimer();
    this.typed = '';
    this.verdict = null;
    this.startedAt = Date.now();
    this.focusField();
  }

  ngAfterViewInit(): void {
    this.focusField();
  }

  ngOnDestroy(): void {
    this.clearTimer();
  }

  /** Facit, som det står i listan. */
  get answer(): string {
    return this.pair.sv;
  }

  submit(): void {
    if (this.verdict !== null || this.typed.trim().length === 0) {
      return;
    }

    const verdict = judge(this.typed, this.pair);
    this.verdict = verdict;
    this.answered.emit({
      pair: this.pair,
      step: 'written',
      correct: verdict === 'correct',
      seconds: (Date.now() - this.startedAt) / 1000,
    });

    // Rätt svar går vidare av sig självt. Ett fel eller ett nästan stannar
    // kvar tills den som övar sett facit och själv tryckt vidare — det är den
    // enda stunden i passet då stavningen faktiskt går att läsa.
    if (verdict === 'correct') {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.completed.emit();
        this.changes.markForCheck();
      }, CORRECT_MS);
    }
  }

  next(): void {
    this.clearTimer();
    this.completed.emit();
  }

  private focusField(): void {
    // Efter att vyn ritats om: fältet finns inte förrän mallen körts.
    setTimeout(() => this.field?.nativeElement.focus());
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
