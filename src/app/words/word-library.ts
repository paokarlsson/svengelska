/**
 * Alla listor appen har: de som kom med bygget och de som kommit till här.
 *
 * `word-catalog.ts` vet vad en glosa är och läser listorna ur bygget. Det här
 * är lagret ovanpå, och det finns för att katalogen inte längre är en konstant:
 * en lista som appen skrivit själv ska gå att öva på i samma stund den finns,
 * utan en terminal och utan en driftsättning.
 *
 * Vyerna frågar biblioteket och aldrig `WORD_BLOCKS` direkt. Den som gör det
 * ser bara bygget, och då är en egen lista osynlig på just det stället.
 */
import { Injectable } from '@angular/core';
import { loadLists, saveLists } from '../services/list-store';
import { WORD_BLOCKS, WordBlock, WordPair, uniqueWords } from './word-catalog';

@Injectable({ providedIn: 'root' })
export class WordLibrary {
  private own: WordBlock[] = loadLists().filter((block) => !isBuiltIn(block.id));

  /**
   * Räknade en gång per ändring och inte per fråga: mallarna läser dem vid
   * varje ändringsdetektering, och en ny array varje gång vore en ny lista
   * varje gång för allt som jämför på identitet.
   */
  private allBlocks: readonly WordBlock[] = [];
  private allWords: readonly WordPair[] = [];

  constructor() {
    this.rebuild();
  }

  /** Byggets listor först, egna sist — den nyaste listan är den sista. */
  get blocks(): readonly WordBlock[] {
    return this.allBlocks;
  }

  /**
   * Alla glosor, en gång var.
   *
   * Det repetitionsplanen behöver: ett ord som fastnat i en lista ska kunna
   * komma tillbaka samma dag som en annan är ny.
   */
  get words(): readonly WordPair[] {
    return this.allWords;
  }

  byId(id: string | null): WordBlock | null {
    return this.allBlocks.find((block) => block.id === id) ?? null;
  }

  /** Om listan kommit till här. Bara sådana går att ta bort. */
  isOwn(id: string): boolean {
    return this.own.some((block) => block.id === id);
  }

  /** Id:n som redan är tagna, för den som ska namnge en ny lista. */
  get takenIds(): ReadonlySet<string> {
    return new Set(this.allBlocks.map((block) => block.id));
  }

  /** Lägger till en lista. En lista med samma id ersätts. */
  add(block: WordBlock): void {
    if (isBuiltIn(block.id)) {
      return;
    }
    this.own = [...this.own.filter((other) => other.id !== block.id), block];
    this.commit();
  }

  /**
   * Tar bort en egen lista.
   *
   * Framstegen rörs inte. De följer ordet och inte listan det stod i, så den
   * som lägger tillbaka samma glosor fortsätter där hen var.
   */
  remove(id: string): void {
    this.own = this.own.filter((block) => block.id !== id);
    this.commit();
  }

  private commit(): void {
    saveLists(this.own);
    this.rebuild();
  }

  private rebuild(): void {
    this.allBlocks = [...WORD_BLOCKS, ...this.own];
    this.allWords = uniqueWords(this.allBlocks.flatMap((block) => block.words));
  }
}

function isBuiltIn(id: string): boolean {
  return WORD_BLOCKS.some((block) => block.id === id);
}
