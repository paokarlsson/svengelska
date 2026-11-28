/**
 * Appen skriver följdfrågor: profilen in, ett träd med påståenden ut.
 *
 * Samma upplägg som `ListWriter`: vad som frågas efter och vad som godtas ligger
 * i `intro/follow-up.ts`, och anropet laddas först när det behövs.
 */
import { Injectable, inject } from '@angular/core';
import { QuestionNode, followUpRequestText, treeFromReply } from '../intro/follow-up';
import { Profile } from '../intro/profile';
import { ApiKeyStore } from './api-key-store';
import { ListWriteError } from './list-write-error';

@Injectable({ providedIn: 'root' })
export class FollowUpWriter {
  private readonly keys = inject(ApiKeyStore);

  /** Frågan till Claude. Ett fält, så att ett test kan peka om det. */
  ask: (apiKey: string, request: string) => Promise<unknown> = async (apiKey, request) => {
    const { FOLLOW_UP_TASK, askClaude, connect } = await import('./claude-call');
    return askClaude(connect(apiKey), request, FOLLOW_UP_TASK);
  };

  get available(): boolean {
    return this.keys.hasKey;
  }

  /** Frågan som den skickas, för loggen. */
  request(profile: Profile, upcoming: readonly string[] = []): string {
    return followUpRequestText(profile, upcoming);
  }

  /** Nästa träd, efter det profilen säger och det som redan står på tur. */
  async write(profile: Profile, upcoming: readonly string[] = []): Promise<QuestionNode> {
    const key = this.keys.key;
    if (key === null) {
      throw new ListWriteError('no-key');
    }
    const reply = await this.ask(key, this.request(profile, upcoming));
    const tree = treeFromReply(reply);
    if (tree === null) {
      throw new ListWriteError('unreadable');
    }
    return tree;
  }
}
