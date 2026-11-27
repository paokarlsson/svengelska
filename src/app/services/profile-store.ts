/**
 * Profilen, och var den ligger.
 *
 * Under en egen nyckel och inte i framstegsdokumentet, av samma skäl som
 * listorna: profilen är vem någon är och framstegen vad hen kan, och
 * «Nollställ framstegen» ska inte få appen att glömma att någon gillar hästar.
 *
 * Profilen lämnar webbläsaren på ett ställe — som några rader i frågan till
 * modellen när en lista ska skrivas. Där står ett åldersspann och inte en
 * ålder, intressen och inte ett namn.
 *
 * Efter startrundan växer den av sig själv: varje varv lämnar en rad om hur de
 * nya orden gick och några räknare om hur någon övar. Det är vad som gör att
 * nivån och personligheten *spåras* och inte bara frågas en gång. Den som
 * aldrig gjort startrundan har ingen profil, och då antecknas inget.
 */
import { Injectable } from '@angular/core';
import {
  LEFT_AFTER,
  Profile,
  ROUNDS_KEPT,
  emptyHabits,
  readProfile,
  storedProfile,
} from '../intro/profile';
import { RoundSummary } from '../training/session';

export const PROFILE_KEY = 'svengelska-profile';

@Injectable({ providedIn: 'root' })
export class ProfileStore {
  /** `undefined` innan lagret lästs, `null` när ingen profil finns. */
  private cached: Profile | null | undefined;

  /** Profilen, eller `null` för den som aldrig gjort startrundan. */
  get profile(): Profile | null {
    if (this.cached === undefined) {
      this.cached = this.read();
    }
    return this.cached;
  }

  get hasProfile(): boolean {
    return this.profile !== null;
  }

  save(profile: Profile): void {
    this.cached = profile;
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(storedProfile(profile)));
    } catch {
      // Privat läge: profilen gäller då sidan ut.
    }
  }

  /**
   * Ett varv som spelats klart.
   *
   * `aim` är nivån listan skrevs för, eller `null` om den är okänd — då räknas
   * varvet till vanorna men säger inget om nivån.
   */
  noteRound(list: string, aim: number | null, summary: RoundSummary): void {
    const profile = this.profile;
    if (profile === null) {
      return;
    }
    const habits = { ...(profile.habits ?? emptyHabits()) };
    habits.finished++;
    habits.misses += summary.misses;
    habits.unsure += summary.unsure;

    const next: Profile = { ...profile, habits };
    if (aim !== null && summary.fresh.answered > 0) {
      const note = { list, aim, answered: summary.fresh.answered, hits: summary.fresh.hits };
      next.rounds = [...(profile.rounds ?? []), note].slice(-ROUNDS_KEPT);
    }
    this.save(next);
  }

  /**
   * Ett varv som lämnades.
   *
   * Felen och «vet ej» räknas oavsett — de är svar som getts. Som lämnat räknas
   * varvet bara efter några kort: den som går ut på första kortet har valt fel
   * lista, inte gett upp.
   */
  noteLeave(summary: Pick<RoundSummary, 'answered' | 'misses' | 'unsure'>): void {
    const profile = this.profile;
    if (profile === null || summary.answered === 0) {
      return;
    }
    const habits = { ...(profile.habits ?? emptyHabits()) };
    if (summary.answered >= LEFT_AFTER) {
      habits.left++;
    }
    habits.misses += summary.misses;
    habits.unsure += summary.unsure;
    this.save({ ...profile, habits });
  }

  clear(): void {
    this.cached = null;
    try {
      localStorage.removeItem(PROFILE_KEY);
    } catch {
      // Inget att ta bort där inget gick att spara.
    }
  }

  private read(): Profile | null {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      return raw === null ? null : readProfile(JSON.parse(raw));
    } catch {
      return null;
    }
  }
}
