import { describe, expect, it } from 'vitest';
import {
  FLING_DISTANCE,
  FLING_SPEED,
  THRESHOLD_MAX,
  THRESHOLD_MIN,
  commitsSwipe,
  dragSpeed,
  isFling,
  swipeProgress,
  swipeThreshold,
} from './swipe-gesture';

/** En dragning på `px` pixlar utspridd över `ms` millisekunder. */
function drag(px: number, ms: number, points = 5) {
  return Array.from({ length: points }, (_, i) => ({
    x: (px / (points - 1)) * i,
    t: (ms / (points - 1)) * i,
  }));
}

/** Stillastående finger: punkter utan rörelse. */
const still = drag(0, 60);

describe('swipeThreshold', () => {
  it('skalar med skärmens bredd', () => {
    expect(swipeThreshold(500)).toBe(110);
  });

  it('har ett golv, så att svepet inte blir gratis på en smal skärm', () => {
    expect(swipeThreshold(200)).toBe(THRESHOLD_MIN);
  });

  it('har ett tak, så att det inte blir en resa på en bred skärm', () => {
    expect(swipeThreshold(2560)).toBe(THRESHOLD_MAX);
  });
});

describe('dragSpeed', () => {
  it('mäter px per millisekund', () => {
    expect(dragSpeed(drag(60, 30))).toBeCloseTo(2, 5);
  });

  it('är noll när det inte finns två punkter att mäta mellan', () => {
    expect(dragSpeed([])).toBe(0);
    expect(dragSpeed([{ x: 40, t: 10 }])).toBe(0);
  });

  it('är noll när punkterna ligger på samma tidpunkt', () => {
    // Annars vore farten oändlig, och varje tryckning ett svep.
    expect(dragSpeed([{ x: 0, t: 5 }, { x: 40, t: 5 }])).toBe(0);
  });

  it('mäter över hela vägen och inte mellan de två sista punkterna', () => {
    // Långsamt hela vägen, men de två sista ligger tätt. Mätt bara på dem
    // hade det här sett ut som en knyck.
    const samples = [
      { x: 0, t: 0 },
      { x: 10, t: 100 },
      { x: 20, t: 200 },
      { x: 24, t: 201 },
    ];
    expect(dragSpeed(samples)).toBeCloseTo(24 / 201, 5);
    expect(isFling(samples)).toBe(false);
  });
});

describe('isFling', () => {
  it('känner igen en snärt', () => {
    expect(isFling(drag(40, 20))).toBe(true); // 2 px/ms
  });

  it('låter en lugn dragning vara', () => {
    expect(isFling(drag(40, 400))).toBe(false); // 0,1 px/ms
  });

  it('kräver mer än gränsfarten, inte exakt den', () => {
    expect(isFling(drag(FLING_SPEED * 100, 100))).toBe(false);
  });
});

describe('commitsSwipe', () => {
  const width = 400; // tröskel: 88 px

  it('godtar en dragning förbi tröskeln hur långsam den än är', () => {
    expect(commitsSwipe(90, drag(90, 3000), width)).toBe(true);
  });

  it('avvisar en kort och långsam dragning', () => {
    expect(commitsSwipe(50, drag(50, 600), width)).toBe(false);
  });

  it('godtar en kort men snabb dragning', () => {
    expect(commitsSwipe(45, drag(45, 20), width)).toBe(true);
  });

  it('avvisar en snabb men alltför kort dragning', () => {
    // Ett finger som lyfts lyfts sällan helt rakt; utan golvet i sträcka
    // hade varje hastig tryckning blivit ett svar.
    expect(commitsSwipe(FLING_DISTANCE, drag(FLING_DISTANCE, 5), width)).toBe(false);
  });

  it('gäller lika åt båda hållen', () => {
    expect(commitsSwipe(-90, still, width)).toBe(true);
    expect(commitsSwipe(-45, drag(-45, 20), width)).toBe(true);
    expect(commitsSwipe(-50, drag(-50, 600), width)).toBe(false);
  });

  it('avvisar ett stillastående finger', () => {
    expect(commitsSwipe(0, still, width)).toBe(false);
  });

  it('kräver längre dragning på en bred skärm än på en smal', () => {
    // Samma sträcka, två skärmar: ett svep ska kosta lika mycket i handen.
    const slow = drag(100, 2000);
    expect(commitsSwipe(100, slow, 320)).toBe(true); // tröskel 70
    expect(commitsSwipe(100, slow, 1440)).toBe(false); // tröskel 130
  });
});

describe('swipeProgress', () => {
  const width = 400; // tröskel: 88 px

  it('är noll i vila', () => {
    expect(swipeProgress(0, width)).toBe(0);
  });

  it('är andelen av tröskeln på vägen dit', () => {
    expect(swipeProgress(44, width)).toBeCloseTo(0.5, 5);
  });

  it('stannar vid ±1 bortom tröskeln', () => {
    expect(swipeProgress(500, width)).toBe(1);
    expect(swipeProgress(-500, width)).toBe(-1);
  });
});
