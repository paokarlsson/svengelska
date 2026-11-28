/**
 * Appen skriver en lista: ett önskemål in, ett block glosor ut.
 *
 * Vad som frågas efter och vad som godtas ligger i `words/generated-list.ts`,
 * där det går att pröva utan en modell. Själva anropet ligger i
 * `claude-call.ts`, som laddas först här — det är det enda stället i appen som
 * talar med Anthropic, och det enda där nyckeln lämnar webbläsaren.
 */
import { Injectable, inject } from '@angular/core';
import { saysSomething } from '../intro/profile';
import { skillOf } from '../intro/skill';
import { blockFromReply, listRequestText } from '../words/generated-list';
import { WordBlock } from '../words/word-catalog';
import { WordLibrary } from '../words/word-library';
import { ApiKeyStore } from './api-key-store';
import { ListWriteError } from './list-write-error';
import { ProfileStore } from './profile-store';

@Injectable({ providedIn: 'root' })
export class ListWriter {
  private readonly keys = inject(ApiKeyStore);
  private readonly library = inject(WordLibrary);
  private readonly profiles = inject(ProfileStore);

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

  /** Frågan som den skickas, för loggen. */
  request(wish: string): string {
    return listRequestText(wish, {
      known: this.library.words,
      profile: this.profiles.profile,
      lists: this.library.ownNames,
    });
  }

  /**
   * Skriver en lista. Sparar ingenting — den som bad om listan ska få se den
   * innan den hamnar bland de andra.
   *
   * Önskemålet får vara tomt för den som gjort startrundan: då väljer modellen
   * temat efter profilen. Utan både önskemål och profil finns inget att gå på,
   * och då är det bättre att säga det än att fråga efter «något».
   */
  async write(wish: string): Promise<WordBlock> {
    const key = this.keys.key;
    if (key === null) {
      throw new ListWriteError('no-key');
    }
    const profile = this.profiles.profile;
    if (wish.trim().length === 0 && (profile === null || !saysSomething(profile))) {
      throw new ListWriteError('no-wish');
    }

    const reply = await this.ask(key, this.request(wish));
    const block = blockFromReply(reply, this.library.takenIds);
    if (block === null) {
      throw new ListWriteError('unreadable');
    }
    // Nivån listan skrevs för följer med, så att första varvet på den kan
    // säga om den låg rätt. Se `intro/skill.ts`.
    const aim = profile === null ? null : skillOf(profile);
    return aim === null ? block : { ...block, level: aim };
  }
}
