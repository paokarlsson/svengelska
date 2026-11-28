/**
 * Appen skriver startrundans påståenden: det som är känt in, påståenden ut.
 *
 * Samma upplägg som `FollowUpWriter`: vad som frågas efter och vad som godtas
 * ligger i `intro/intro-writing.ts`, och anropet laddas först när det behövs.
 */
import { Injectable, inject } from '@angular/core';
import { IntroBatch } from '../intro/intro-run';
import { batchFromReply, introRequestText } from '../intro/intro-writing';
import { Profile } from '../intro/profile';
import { Ai } from './ai';
import { ApiKeyStore } from './api-key-store';
import { ListWriteError } from './list-write-error';

@Injectable({ providedIn: 'root' })
export class IntroWriter {
  private readonly keys = inject(ApiKeyStore);
  private readonly ai = inject(Ai);

  /** Frågan till Claude. Ett fält, så att ett test kan peka om det. */
  ask: (apiKey: string, request: string) => Promise<unknown> = (apiKey, request) =>
    this.ai.ask(apiKey, request, 'intro');

  get available(): boolean {
    return this.keys.hasKey;
  }

  /** Frågan som den skickas, för loggen. */
  request(profile: Profile, shown: readonly string[]): string {
    return introRequestText(profile, shown);
  }

  async write(profile: Profile, shown: readonly string[]): Promise<IntroBatch> {
    const key = this.keys.key;
    if (key === null) {
      throw new ListWriteError('no-key');
    }
    const batch = batchFromReply(await this.ask(key, this.request(profile, shown)), shown);
    if (batch === null) {
      throw new ListWriteError('unreadable');
    }
    return batch;
  }
}
