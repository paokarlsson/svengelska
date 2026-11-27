/**
 * Loggen: allt som händer i appen, medan den utvecklas.
 *
 * Framstegsdokumentet minns vad som *blev* av ett svar — en låda, de fem
 * senaste utfallen. Det här minns vad som *hände*: varje tryck, varje drag med
 * fingrets hela väg, varje kort, varje svar, varje sidbyte. Det är ett annat
 * slags data med ett annat syfte. Framstegen är till för den som övar; loggen
 * är till för den som bygger, och svarar på frågor framstegen inte kan: drar
 * någon kortet halvvägs och ångrar sig? Trycker någon på raden under kortet i
 * tron att den är knappar? Hur lång tid går mellan att kortet visas och att
 * fingret rör det?
 *
 * Tre saker är bestämda av att loggen ligger i en webbläsare och inte på en
 * server:
 *
 * **Den lämnar aldrig enheten av sig själv.** Det finns ingen server att
 * skicka den till. Den som vill ha den analyserad exporterar den för hand,
 * under Inställningar.
 *
 * **Den har ett tak.** `localStorage` rymmer några megabyte, och en logg som
 * växer tills lagret är fullt tar framstegen med sig i fallet. Varje besök är
 * en egen post, och de äldsta kastas när taket nås.
 *
 * **Det som skrivs i ett fält loggas aldrig.** Ett av fälten är för en
 * API-nyckel. Loggen ser *att* någon tryckte på ett fält, aldrig vad som står
 * i det — se `describeTarget()`.
 *
 * Påslagen från början, eftersom appen är under utveckling: se
 * `TRACK_BY_DEFAULT`. Den dag appen är färdig nog att inte behöva den är det
 * en rad att ändra.
 */
import { Injectable } from '@angular/core';

/** Om loggen är på för den som aldrig rört reglaget. */
export const TRACK_BY_DEFAULT = true;

export const TRACK_KEY = 'svengelska-track';
export const LOG_INDEX_KEY = 'svengelska-log-index';
export const LOG_PREFIX = 'svengelska-log-';

/** Höjs när formen ändras, så att den som läser vet vad den läser. */
export const LOG_VERSION = 1;

/**
 * Taket för hela loggen, i tecken.
 *
 * ANTAGANDE: en och en halv miljon tecken är ungefär åttio varv med varje
 * fingerrörelse, och en bra bit under vad `localStorage` rymmer.
 */
export const MAX_LOG_CHARS = 1_500_000;

/** Hur ofta loggen skrivs till lagret medan något händer. */
const FLUSH_MS = 2000;

/** Så många punkter en dragning får bära. Fler än så är ett finger som vilar. */
export const MAX_PATH_POINTS = 240;

/** En händelse: när, vad, och det som hör till. */
export interface LogEvent {
  /** Millisekunder sedan besöket började. */
  t: number;
  /** Vad som hände: `down`, `click`, `card`, `drag`, `answer`, `nav` … */
  k: string;
  [detail: string]: unknown;
}

/** Ett besök: från att sidan laddades till att den lämnades. */
export interface LogSession {
  id: string;
  /** När besöket började, i millisekunder. */
  start: number;
  /** Skärmen och webbläsaren, så att ett drag går att tolka. */
  env: Record<string, unknown>;
  events: LogEvent[];
}

export interface LogStats {
  sessions: number;
  events: number;
  chars: number;
}

/**
 * Vad någon tryckte på, i ord — utan något som står i ett fält.
 *
 * En knapp beskrivs med sin text, eftersom texten *är* knappen. Ett fält
 * beskrivs bara med vad det är: där kan en API-nyckel stå, eller en glosläxa,
 * och loggen ska gå att klistra in var som helst utan att någon behöver läsa
 * igenom den först.
 */
export function describeTarget(target: unknown): string {
  if (!(target instanceof Element)) {
    return '?';
  }
  const field = target.closest('input, textarea, select');
  if (field !== null) {
    const id = field.id ? `#${field.id}` : '';
    return `${field.tagName.toLowerCase()}${id}`;
  }
  // Raden under kortet före knapparna: den är byggd av knappar, men ska gå att
  // skilja från dem i loggen. Det var trycken här som visade att den lästes som
  // knappar innan den var det, och det ska gå att följa vad som hände sedan.
  const legend = target.closest('.legend li');
  if (legend !== null) {
    return `legend:${squeeze(legend.textContent ?? '')}`;
  }
  const button = target.closest('button, a, [role="button"]');
  if (button !== null) {
    const name = button.getAttribute('aria-label') ?? button.textContent ?? '';
    return `button:${squeeze(name)}`;
  }
  if (target.closest('.game-card') !== null) {
    return 'card';
  }
  const className = typeof target.className === 'string' ? target.className : '';
  const first = className.split(/\s+/).find((name) => name.length > 0);
  return first ? `${target.tagName.toLowerCase()}.${first}` : target.tagName.toLowerCase();
}

function squeeze(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 40);
}

/**
 * En dragnings väg, tät nog att spara.
 *
 * Hela tal, och högst `MAX_PATH_POINTS` punkter: blir det fler behålls var
 * n:te, och alltid den sista — var draget slutade är det viktigaste med det.
 */
export function compactPath(points: readonly (readonly [number, number, number])[]): number[][] {
  const rounded = points.map(([t, x, y]) => [Math.round(t), Math.round(x), Math.round(y)]);
  if (rounded.length <= MAX_PATH_POINTS) {
    return rounded;
  }
  const step = Math.ceil(rounded.length / MAX_PATH_POINTS);
  const kept = rounded.filter((_, index) => index % step === 0);
  const last = rounded[rounded.length - 1];
  if (kept[kept.length - 1] !== last) {
    kept.push(last);
  }
  return kept;
}

/**
 * Vilka besök som ska kastas för att loggen ska rymmas under taket.
 *
 * Äldst först, och aldrig det pågående: en logg som kastar det som händer nu
 * för att minnas det som hände i förrgår har missförstått sin uppgift.
 */
export function sessionsToDrop(
  sizes: readonly { id: string; chars: number }[],
  currentId: string,
  cap: number = MAX_LOG_CHARS,
): string[] {
  let total = sizes.reduce((sum, session) => sum + session.chars, 0);
  const dropped: string[] = [];
  for (const session of sizes) {
    if (total <= cap) {
      break;
    }
    if (session.id !== currentId) {
      dropped.push(session.id);
      total -= session.chars;
    }
  }
  return dropped;
}

@Injectable({ providedIn: 'root' })
export class Tracker {
  private readonly session: LogSession = {
    id: `s${Date.now()}`,
    start: Date.now(),
    env: {},
    events: [],
  };
  private on = readFlag();
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listening = false;

  /** Om loggen är på. */
  get enabled(): boolean {
    return this.on;
  }

  set enabled(value: boolean) {
    // Att loggen stängdes av är det sista den får veta.
    if (!value) {
      this.log('track', { on: false });
      this.flush();
    }
    this.on = value;
    try {
      localStorage.setItem(TRACK_KEY, value ? 'on' : 'off');
    } catch {
      // Privat läge: valet gäller sidan ut.
    }
    if (value) {
      this.log('track', { on: true });
    }
  }

  /**
   * Börjar lyssna på det som inte hör till någon vy: varje tryck, varje klick,
   * när appen hamnar i bakgrunden, och fel som ingen fångade.
   *
   * Anropas en gång, av skalet. Lyssnarna sitter kvar även när loggen är av —
   * det är `log()` som avgör om något sparas, så att reglaget verkar direkt.
   */
  start(): void {
    if (this.listening || typeof document === 'undefined') {
      return;
    }
    this.listening = true;
    this.session.env = environment();
    this.log('start');

    // `capture`, så att trycket loggas även när något längre in stoppar det.
    document.addEventListener(
      'pointerdown',
      (event) =>
        this.log('down', {
          x: Math.round(event.clientX),
          y: Math.round(event.clientY),
          el: describeTarget(event.target),
          by: event.pointerType,
        }),
      true,
    );
    document.addEventListener(
      'click',
      (event) => this.log('click', { el: describeTarget(event.target) }),
      true,
    );
    document.addEventListener('visibilitychange', () => {
      this.log('visible', { on: document.visibilityState === 'visible' });
      if (document.visibilityState !== 'visible') {
        this.flush();
      }
    });
    window.addEventListener('pagehide', () => this.flush());
    window.addEventListener('error', (event) => this.log('error', { msg: squeeze(event.message) }));
  }

  /** En händelse. Gör ingenting när loggen är av. */
  log(kind: string, detail: Record<string, unknown> = {}): void {
    if (!this.on) {
      return;
    }
    this.session.events.push({ t: Date.now() - this.session.start, k: kind, ...detail });
    this.dirty = true;
    if (this.timer === null) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.flush();
      }, FLUSH_MS);
    }
  }

  /** Skriver det pågående besöket till lagret, och håller loggen under taket. */
  flush(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.dirty) {
      return;
    }
    this.dirty = false;
    try {
      const index = readIndex();
      if (!index.includes(this.session.id)) {
        index.push(this.session.id);
      }
      localStorage.setItem(LOG_PREFIX + this.session.id, JSON.stringify(this.session));

      const sizes = index.map((id) => ({
        id,
        chars: localStorage.getItem(LOG_PREFIX + id)?.length ?? 0,
      }));
      const dropped = sessionsToDrop(sizes, this.session.id);
      for (const id of dropped) {
        localStorage.removeItem(LOG_PREFIX + id);
      }
      localStorage.setItem(
        LOG_INDEX_KEY,
        JSON.stringify(index.filter((id) => !dropped.includes(id))),
      );
    } catch {
      // Fullt lager eller privat läge. Loggen är till för utvecklingen och får
      // aldrig stå i vägen för övningen: det som inte gick att skriva är borta.
    }
  }

  /** Alla sparade besök, äldst först, med det pågående sist. */
  sessions(): LogSession[] {
    this.flush();
    const sessions: LogSession[] = [];
    for (const id of readIndex()) {
      if (id === this.session.id) {
        continue;
      }
      try {
        const raw = localStorage.getItem(LOG_PREFIX + id);
        if (raw !== null) {
          sessions.push(JSON.parse(raw) as LogSession);
        }
      } catch {
        // Ett besök som inte går att läsa är ett besök mindre, inte ett fel.
      }
    }
    if (this.session.events.length > 0) {
      sessions.push(this.session);
    }
    return sessions;
  }

  stats(): LogStats {
    const sessions = this.sessions();
    return {
      sessions: sessions.length,
      events: sessions.reduce((sum, session) => sum + session.events.length, 0),
      chars: sessions.reduce((sum, session) => sum + JSON.stringify(session).length, 0),
    };
  }

  /** Hela loggen som den exporteras. */
  export(now: number = Date.now()): Record<string, unknown> {
    return {
      app: 'svengelska',
      logVersion: LOG_VERSION,
      exportedAt: new Date(now).toISOString(),
      sessions: this.sessions(),
    };
  }

  /** Tömmer loggen. Det pågående besöket börjar om från noll. */
  clear(): void {
    this.session.events = [];
    this.dirty = false;
    try {
      for (const id of readIndex()) {
        localStorage.removeItem(LOG_PREFIX + id);
      }
      localStorage.removeItem(LOG_INDEX_KEY);
    } catch {
      // Inget att tömma där inget gick att spara.
    }
  }
}

function readFlag(): boolean {
  try {
    const stored = localStorage.getItem(TRACK_KEY);
    return stored === null ? TRACK_BY_DEFAULT : stored === 'on';
  } catch {
    return TRACK_BY_DEFAULT;
  }
}

function readIndex(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LOG_INDEX_KEY) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string')
      : [];
  } catch {
    return [];
  }
}

/** Skärmen och webbläsaren. Utan dem går en koordinat inte att tolka. */
function environment(): Record<string, unknown> {
  return {
    w: window.innerWidth,
    h: window.innerHeight,
    dpr: window.devicePixelRatio,
    touch: navigator.maxTouchPoints > 0,
    lang: navigator.language,
    ua: navigator.userAgent,
  };
}
