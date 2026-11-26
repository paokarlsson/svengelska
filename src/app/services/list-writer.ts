/**
 * Appen skriver en lista: ett önskemål in, ett block glosor ut.
 *
 * Vad som frågas efter och vad som godtas ligger i `words/generated-list.ts`,
 * där det går att pröva utan en modell. Själva anropet ligger i
 * `claude-call.ts`, som laddas först här — det är det enda stället i appen som
 * talar med Anthropic, och det enda där nyckeln lämnar webbläsaren.
 */
import { Injectable, inject } from '@angular/core';
import { blockFromReply, listRequestText } from '../words/generated-list';
import { WordBlock } from '../words/word-catalog';
import { WordLibrary } from '../words/word-library';
import { ApiKeyStore } from './api-key-store';
import { ListWriteError } from './list-write-error';

@Injectable({ providedIn: 'root' })
export class ListWriter {
  private readonly keys = inject(ApiKeyStore);
  private readonly library = inject(WordLibrary);

  /**
   * Frågan till Claude: nyckel och önskemål in, det tolkade svaret ut.
   *
   * Ett fält för att ett test ska kunna peka om det, av samma skäl som
   * `useRepository()` i motorn. Importen är dynamisk med flit — se
   * `claude-call.ts`.
   */
  ask: (apiKey: string, request: string) => Promise<unknown> = async (apiKey, request) => {
    const { askClaude, connect } = await import('./claude-call');
    return askClaude(connect(apiKey), request);
  };

  /**
   * Skriver en lista efter önskemålet. Sparar ingenting — den som bad om listan
   * ska få se den innan den hamnar bland de andra.
   */
  async write(wish: string): Promise<WordBlock> {
    const key = this.keys.key;
    if (key === null) {
      throw new ListWriteError('no-key');
    }

    const reply = await this.ask(key, listRequestText(wish, this.library.words));
    const block = blockFromReply(reply, this.library.takenIds);
    if (block === null) {
      throw new ListWriteError('unreadable');
    }
    return block;
  }
}
