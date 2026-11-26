/**
 * Anthropic-nyckeln, och ingenting annat.
 *
 * Appen är en ren webbsida utan server bakom sig, så den som vill att appen
 * ska skriva listor åt sig lägger in sin egen nyckel. Den bor under en egen
 * nyckel i `localStorage` och inte i framstegsdokumentet, av två skäl:
 * «Nollställ framstegen» ska inte kasta den, och ett framstegsdokument som
 * någon gång exporteras eller delas ska inte bära en hemlighet med sig.
 *
 * Nyckeln lämnar webbläsaren på ett enda ställe — anropet i `list-writer.ts`,
 * som går till Anthropic och ingen annanstans.
 */
import { Injectable } from '@angular/core';

export const API_KEY_KEY = 'svengelska-anthropic-key';

/**
 * Nyckeln som den ska lagras, eller `null` om det inte fanns någon.
 *
 * En inklistrad nyckel har ofta ett radbrott eller ett blanksteg med sig, och
 * ett sådant tecken ger ett avvisat anrop som ser ut som en felaktig nyckel.
 * Formen i övrigt prövas inte här: det är Anthropic som vet vad en giltig
 * nyckel är, och en gissning om prefixet blir fel den dag formatet ändras.
 */
export function cleanKey(value: string): string | null {
  const cleaned = value.replace(/\s+/g, '');
  return cleaned.length > 0 ? cleaned : null;
}

@Injectable({ providedIn: 'root' })
export class ApiKeyStore {
  /** `undefined` innan lagret lästs. Mallarna frågar vid varje kontroll. */
  private cached: string | null | undefined;

  get key(): string | null {
    if (this.cached === undefined) {
      this.cached = this.read();
    }
    return this.cached;
  }

  get hasKey(): boolean {
    return this.key !== null;
  }

  /** De sista tecknen, så att det går att se *vilken* nyckel som ligger inne. */
  get hint(): string | null {
    const key = this.key;
    return key === null ? null : `…${key.slice(-4)}`;
  }

  /** Sparar nyckeln. `false` om det som klistrades in var tomt. */
  save(value: string): boolean {
    const key = cleanKey(value);
    if (key === null) {
      return false;
    }
    this.cached = key;
    try {
      localStorage.setItem(API_KEY_KEY, key);
    } catch {
      // Privat läge: nyckeln gäller då sidan ut och är borta vid nästa besök.
    }
    return true;
  }

  clear(): void {
    this.cached = null;
    try {
      localStorage.removeItem(API_KEY_KEY);
    } catch {
      // Inget att ta bort där inget gick att spara.
    }
  }

  private read(): string | null {
    try {
      return cleanKey(localStorage.getItem(API_KEY_KEY) ?? '');
    } catch {
      return null;
    }
  }
}
