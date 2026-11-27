import { beforeEach, describe, expect, it } from 'vitest';
import {
  LOG_INDEX_KEY,
  LOG_PREFIX,
  MAX_PATH_POINTS,
  TRACK_BY_DEFAULT,
  Tracker,
  compactPath,
  describeTarget,
  sessionsToDrop,
} from './tracker';

function element(html: string, selector: string): Element {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host.querySelector(selector)!;
}

describe('describeTarget', () => {
  it('beskriver en knapp med sin text', () => {
    expect(describeTarget(element('<button> Spara\n nyckeln </button>', 'button'))).toBe(
      'button:Spara nyckeln',
    );
  });

  it('hittar knappen även när trycket landade på något inuti den', () => {
    expect(describeTarget(element('<button><span>Kör</span></button>', 'span'))).toBe('button:Kör');
  });

  // Ett av fälten är för en API-nyckel. Loggen ska gå att klistra in var som
  // helst utan att någon behöver läsa igenom den först.
  it('säger aldrig vad som står i ett fält', () => {
    const input = element('<input id="api-key" value="sk-ant-hemlig-1234">', 'input');
    const area = element('<textarea id="wish">min glosläxa</textarea>', 'textarea');

    expect(describeTarget(input)).toBe('input#api-key');
    expect(describeTarget(area)).toBe('textarea#wish');
    expect(describeTarget(input)).not.toContain('hemlig');
  });

  it('känner igen kortet och raden under det', () => {
    expect(describeTarget(element('<div class="game-card"><p class="word">dog</p></div>', 'p'))).toBe(
      'card',
    );
    expect(describeTarget(element('<ul class="legend"><li><span>Fel</span></li></ul>', 'span'))).toBe(
      'legend:Fel',
    );
  });

  it('klarar det som inte är ett element', () => {
    expect(describeTarget(null)).toBe('?');
    expect(describeTarget(document)).toBe('?');
  });
});

describe('compactPath', () => {
  it('avrundar till hela tal', () => {
    expect(compactPath([[0.4, 10.6, -3.2]])).toEqual([[0, 11, -3]]);
  });

  it('tunnar ut en lång väg men behåller var den slutade', () => {
    const long = Array.from({ length: 1000 }, (_, i): [number, number, number] => [i, i * 2, 0]);
    const kept = compactPath(long);

    expect(kept.length).toBeLessThanOrEqual(MAX_PATH_POINTS + 1);
    expect(kept[0]).toEqual([0, 0, 0]);
    expect(kept.at(-1)).toEqual([999, 1998, 0]);
  });
});

describe('sessionsToDrop', () => {
  const sizes = [
    { id: 'a', chars: 400 },
    { id: 'b', chars: 400 },
    { id: 'c', chars: 400 },
  ];

  it('kastar ingenting under taket', () => {
    expect(sessionsToDrop(sizes, 'c', 2000)).toEqual([]);
  });

  it('kastar äldst först, och bara så många som behövs', () => {
    expect(sessionsToDrop(sizes, 'c', 900)).toEqual(['a']);
    expect(sessionsToDrop(sizes, 'c', 500)).toEqual(['a', 'b']);
  });

  // En logg som kastar det som händer nu för att minnas det som hände i
  // förrgår har missförstått sin uppgift.
  it('kastar aldrig det pågående besöket', () => {
    expect(sessionsToDrop(sizes, 'a', 100)).toEqual(['b', 'c']);
  });
});

describe('Tracker', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('är på från början, medan appen utvecklas', () => {
    expect(TRACK_BY_DEFAULT).toBe(true);
    expect(new Tracker().enabled).toBe(true);
  });

  it('sparar händelser i den ordning de kom, med tid sedan besöket började', () => {
    const tracker = new Tracker();
    tracker.log('nav', { to: 'home' });
    tracker.log('answer', { r: 'affirm' });

    const [session] = tracker.sessions();
    expect(session.events.map((event) => event.k)).toEqual(['nav', 'answer']);
    expect(session.events[1]).toMatchObject({ r: 'affirm' });
    expect(session.events.every((event) => event.t >= 0)).toBe(true);
  });

  it('sparar ingenting när den är av, och minns valet', () => {
    const tracker = new Tracker();
    tracker.enabled = false;
    tracker.clear();
    tracker.log('answer', { r: 'affirm' });

    expect(tracker.stats().events).toBe(0);
    expect(new Tracker().enabled).toBe(false);
  });

  it('minns tidigare besök, äldst först', () => {
    const first = new Tracker();
    first.log('nav', { to: 'home' });
    first.flush();
    const firstId = first.sessions()[0].id;

    // Ett besök är en sidladdning. Två i samma millisekund får samma id, så
    // det andra får ett eget här.
    const second = new Tracker();
    (second as unknown as { session: { id: string } }).session.id = `${firstId}-b`;
    second.log('nav', { to: 'session' });

    const sessions = second.sessions();
    expect(sessions).toHaveLength(2);
    expect(sessions[0].events[0]).toMatchObject({ to: 'home' });
    expect(sessions[1].events[0]).toMatchObject({ to: 'session' });
  });

  it('töms helt, också ur lagret', () => {
    const tracker = new Tracker();
    tracker.log('nav', { to: 'home' });
    tracker.flush();
    tracker.clear();

    expect(tracker.stats()).toEqual({ sessions: 0, events: 0, chars: 0 });
    expect(localStorage.getItem(LOG_INDEX_KEY)).toBeNull();
    expect(Object.keys(localStorage).some((key) => key.startsWith(LOG_PREFIX))).toBe(false);
  });

  it('exporterar med version och tidpunkt', () => {
    const tracker = new Tracker();
    tracker.log('nav', { to: 'home' });

    const exported = tracker.export(Date.UTC(2026, 10, 27, 8, 30));
    expect(exported).toMatchObject({ app: 'svengelska', exportedAt: '2026-11-27T08:30:00.000Z' });
    expect(JSON.stringify(exported)).toContain('"to":"home"');
  });

  it('går att öva med även när lagret innehåller skräp', () => {
    localStorage.setItem(LOG_INDEX_KEY, '{inte json');
    const tracker = new Tracker();
    tracker.log('nav', { to: 'home' });

    expect(() => tracker.flush()).not.toThrow();
    expect(tracker.stats().events).toBe(1);
  });
});
