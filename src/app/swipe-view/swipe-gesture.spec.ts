import { describe, expect, it } from 'vitest';
import {
  DragSample,
  FLING_DISTANCE,
  FLING_SPEED,
  THRESHOLD_MAX,
  THRESHOLD_MIN,
  THRESHOLD_MIN_Y,
  commitsSwipe,
  downProgress,
  dragSpeed,
  isFling,
  swipeProgress,
  swipeThreshold,
  swipeThresholdY,
} from './swipe-gesture';

/** En dragning på `px` pixlar längs en axel, utspridd över `ms` ms. */
function drag(px: number, ms: number, axis: 'x' | 'y' = 'x', points = 5): DragSample[] {
  return Array.from({ length: points }, (_, i) => ({
    x: axis === 'x' ? (px / (points - 1)) * i : 0,
    y: axis === 'y' ? (px / (points - 1)) * i : 0,
    t: (ms / (points - 1)) * i,
  }));
}

/** Stillastående finger: punkter utan rörelse. */
const still = drag(0, 60);

/** En skärm att räkna mot. 500 × 800 ger trösklarna 110 respektive 112. */
const W = 500;
const H = 800;

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

describe('swipeThresholdY', () => {
  it('mäts mot höjden och inte mot bredden', () => {
    expect(swipeThresholdY(800)).toBeCloseTo(112);
    expect(swipeThresholdY(800)).not.toBe(swipeThreshold(800));
  });

  it('har ett högre golv än sidled — en nedåtknyck är lättare att råka göra', () => {
    expect(THRESHOLD_MIN_Y).toBeGreaterThan(THRESHOLD_MIN);
    expect(swipeThresholdY(300)).toBe(THRESHOLD_MIN_Y);
  });
});

describe('dragSpeed', () => {
  it('mäter px per millisekund längs sin axel', () => {
    expect(dragSpeed(drag(120, 60), 'x')).toBeCloseTo(2);
    expect(dragSpeed(drag(120, 60, 'y'), 'y')).toBeCloseTo(2);
  });

  it('ser ingen fart alls på den andra axeln', () => {
    expect(dragSpeed(drag(120, 60, 'y'), 'x')).toBe(0);
  });

  it('ger noll när det inte går att mäta', () => {
    expect(dragSpeed([])).toBe(0);
    expect(dragSpeed(still)).toBe(0);
  });
});

describe('isFling', () => {
  it('godtar en snärt', () => {
    expect(isFling(drag(FLING_SPEED * 100 + 20, 100))).toBe(true);
  });

  it('avvisar ett långsamt drag', () => {
    expect(isFling(drag(20, 500))).toBe(false);
  });
});

describe('commitsSwipe', () => {
  it('svarar sant åt höger och falskt åt vänster', () => {
    expect(commitsSwipe(200, 0, still, W, H)).toBe('affirm');
    expect(commitsSwipe(-200, 0, still, W, H)).toBe('deny');
  });

  it('svarar «vet ej» rakt nedåt', () => {
    expect(commitsSwipe(0, 200, still, W, H)).toBe('unsure');
  });

  it('gör ingenting uppåt — en gest utan betydelse ska inte ha någon', () => {
    expect(commitsSwipe(0, -300, still, W, H)).toBeNull();
  });

  it('avvisar en darrning åt alla håll', () => {
    expect(commitsSwipe(8, 0, still, W, H)).toBeNull();
    expect(commitsSwipe(0, 8, still, W, H)).toBeNull();
  });

  it('godtar en knyck fast sträckan är kort', () => {
    const flick = drag(FLING_DISTANCE + 10, 20);
    expect(commitsSwipe(FLING_DISTANCE + 10, 0, flick, W, H)).toBe('affirm');
  });

  it('godtar inte en knyck som är för kort för att vara ett drag', () => {
    const tap = drag(FLING_DISTANCE - 5, 5);
    expect(commitsSwipe(FLING_DISTANCE - 5, 0, tap, W, H)).toBeNull();
  });

  /**
   * Diagonalen tillhör den axel som kommit längst *i förhållande till sin egen
   * tröskel*, inte den som kommit längst i pixlar. Annars vinner den billigare
   * axeln varje diagonal bara för att den är billigare, och då är den dyrare
   * gesten i praktiken oåtkomlig.
   */
  it('låter den dominerande axeln avgöra, mätt som andel av sin tröskel', () => {
    // Båda axlarna är förbi sin tröskel; den som kommit längst *i förhållande
    // till vad som krävs* vinner. I pixlar är sidled längre i båda fallen.
    const mostlyDown = commitsSwipe(swipeThreshold(W) * 1.1, swipeThresholdY(H) * 1.6, still, W, H);
    expect(mostlyDown).toBe('unsure');

    const mostlySideways = commitsSwipe(swipeThreshold(W) * 2, swipeThresholdY(H) * 1.1, still, W, H);
    expect(mostlySideways).toBe('affirm');
  });

  it('är aldrig tvetydigt: ett drag ger ett svar eller inget', () => {
    for (let dx = -300; dx <= 300; dx += 37) {
      for (let dy = -300; dy <= 300; dy += 41) {
        const answer = commitsSwipe(dx, dy, still, W, H);
        expect(answer === null || ['affirm', 'deny', 'unsure'].includes(answer)).toBe(true);
      }
    }
  });
});

describe('progress', () => {
  it('går från -1 till +1 i sidled och klampar där', () => {
    expect(swipeProgress(0, W)).toBe(0);
    expect(swipeProgress(9999, W)).toBe(1);
    expect(swipeProgress(-9999, W)).toBe(-1);
  });

  it('går från 0 till 1 nedåt, och räknar uppåt som noll', () => {
    expect(downProgress(0, H)).toBe(0);
    expect(downProgress(9999, H)).toBe(1);
    expect(downProgress(-400, H)).toBe(0);
  });
});
