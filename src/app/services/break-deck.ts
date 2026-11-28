/**
 * Avbrotten mitt i varven: vilket som kommer härnäst, och var svaret hamnar.
 *
 * Fröna i `intro/breaks.ts` räcker en bra bit, och ett ja till ett frö med en
 * följdfråga byggs vidare på utan en modell. Med en nyckel skriver Claude nya
 * avbrott i bakgrunden, utifrån allt som svarats — både på avbrotten och i
 * startrundan — och de går före fröna. Ingen väntar på dem: finns inget
 * skrivet tas ett frö.
 *
 * Svaren sparas i profilen. Utan profil visas inga avbrott, eftersom det inte
 * finns något att bygga vidare på dem i.
 */
import { Injectable, inject } from '@angular/core';
import { Break, SEEDS, breakNote, breaksFromReply, followUpOf, nextBreak } from '../intro/breaks';
import { BREAKS_KEPT, Note, Profile } from '../intro/profile';
import { Response } from '../training/word-state';
import { describeLearner } from '../words/generated-list';
import { ApiKeyStore } from './api-key-store';
import { ProfileStore } from './profile-store';
import { Tracker } from './tracker';

/**
 * Var i varvet avbrottet kommer: efter så stor del av korten som räknas.
 * Mitt i, så att det bryter av och inte bara blir en början eller ett slut.
 */
export const BREAK_AT = 0.5;

/**
 * Frågan till Claude: vad appen vet, och avbrotten som redan svarats.
 *
 * Avbrotten listas för sig även om `describeLearner` också nämner dem, för här
 * står även «vet ej» med — det är ett avbrott som inte ska frågas igen.
 */
export function breakRequestText(profile: Profile): string {
  const parts = [describeLearner(profile) ?? 'Appen vet ingenting om eleven än.'];
  const asked = profile.breaks ?? [];
  if (asked.length > 0) {
    parts.push(`Avbrott eleven redan fått — fråga inte om dem igen:\n${asked.map((note) => `- ${note.text}`).join('\n')}`);
  }
  // Fröna som inte frågats än ligger kvar i högen. Loggen visade Claude skriva
  // «Jag kan vissla med två fingrar i munnen» när «Jag kan vissla med
  // fingrarna» väntade på sin tur.
  const done = new Set(asked.map((note) => note.text));
  const waiting = SEEDS.filter((seed) => !done.has(seed.text)).map(
    (seed) => `${seed.text} (öppnar: ${seed.opens})`,
  );
  if (waiting.length > 0) {
    parts.push(`Ligger redan i appens hög och kommer senare — skriv inget som liknar dem:\n${waiting.map((text) => `- ${text}`).join('\n')}`);
  }
  return parts.join('\n\n');
}

@Injectable({ providedIn: 'root' })
export class BreakDeck {
  private readonly keys = inject(ApiKeyStore);
  private readonly profiles = inject(ProfileStore);
  private readonly tracker = inject(Tracker);

  /** Avbrott Claude skrivit som ännu inte visats. Lever sidan ut. */
  private written: Break[] = [];
  private fetching = false;

  /** Frågan till Claude. Ett fält, så att ett test kan peka om det. */
  ask: (apiKey: string, request: string) => Promise<unknown> = async (apiKey, request) => {
    const { BREAK_TASK, askClaude, connect } = await import('./claude-call');
    return askClaude(connect(apiKey), request, BREAK_TASK);
  };

  /** Om det finns någon att visa avbrott för. */
  get available(): boolean {
    return this.profiles.hasProfile;
  }

  /**
   * Nästa avbrott, eller `null` om inget finns. Tar inget ur högen — det görs
   * först när det besvarats, så att ett avbrott som aldrig visades inte går
   * förlorat.
   */
  peek(random: () => number = Math.random): Break | null {
    const profile = this.profiles.profile;
    if (profile === null) {
      return null;
    }
    const asked = profile.breaks ?? [];
    const done = new Set(asked.map((note) => note.text));
    this.written = this.written.filter((item) => !done.has(item.text));
    // Ett ja till ett frö med följdfråga går före det skrivna: det är det som
    // bygger vidare på just det svaret.
    return followUpOf(asked) ?? this.written[0] ?? nextBreak(asked, profile.age, random);
  }

  /** Glömmer det Claude skrivit. För den som börjar om: de skrevs för någon annan. */
  forget(): void {
    this.written = [];
  }

  /** Svaret på ett avbrott. Sparas, och nya skrivs om högen börjar ta slut. */
  answer(item: Break, response: Response): Note | null {
    const profile = this.profiles.profile;
    if (profile === null) {
      return null;
    }
    const note = breakNote(item, response);
    this.written = this.written.filter((other) => other.text !== item.text);
    this.profiles.save({ ...profile, breaks: [...(profile.breaks ?? []), note].slice(-BREAKS_KEPT) });
    this.refill();
    return note;
  }

  /**
   * Skriver nya avbrott i bakgrunden, om det finns en nyckel och högen är tom.
   * Går det inte blir det frön, och ingen behöver få veta det.
   */
  refill(): void {
    const key = this.keys.key;
    const profile = this.profiles.profile;
    if (key === null || profile === null || this.fetching || this.written.length > 0) {
      return;
    }
    this.fetching = true;
    const began = Date.now();
    const request = breakRequestText(profile);
    this.tracker.log('break.ask', { request });
    this.ask(key, request)
      .then((reply) => {
        const now = this.profiles.profile;
        this.written = breaksFromReply(reply, now?.breaks ?? []);
        this.tracker.log('break.got', { ms: Date.now() - began, breaks: this.written });
      })
      .catch(() => {
        this.tracker.log('break.failed', { ms: Date.now() - began });
      })
      .finally(() => {
        this.fetching = false;
      });
  }
}
