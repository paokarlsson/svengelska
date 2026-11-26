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
 */
import { Injectable } from '@angular/core';
import { Profile, readProfile } from '../intro/profile';

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
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } catch {
      // Privat läge: profilen gäller då sidan ut.
    }
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
