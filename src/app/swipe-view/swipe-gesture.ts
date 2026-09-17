/**
 * Svepet som gest: när en dragning är ett svar, och vilket.
 *
 * Reglerna ligger här och inte i komponenten, av samma skäl som överallt annars
 * i appen: det som är en regel ska gå att pröva utan en skärm. `ganger` har
 * samma tal inbakade i sin vy och därför inget test på dem, och tal som bara
 * går att pröva med tummen är tal som glider.
 *
 * Två saker får ett drag att räknas som ett svep:
 *
 * 1. **Sträckan.** Kortet dras förbi tröskeln. Tröskeln är en andel av skärmen
 *    och inte ett fast antal pixlar — ett svep ska kosta lika mycket i handen
 *    på en telefon som med en mus på en bred skärm.
 * 2. **Knycken.** Farten är hög nog, även om sträckan är kort. Det är så en
 *    tumme faktiskt sveper: en snärt, inte en resa tvärs över kortet.
 *
 * Knycken har ändå ett golv i sträcka. Utan det blir varje hastig tryckning ett
 * svar, eftersom ett finger som lyfts sällan lyfts helt rakt.
 *
 * **Tre riktningar, inte två.** Höger är sant, vänster är falskt, ner är «vet
 * ej». Uppåt är obundet: en gest som inte betyder något ska inte göra något, och
 * kortet fjädrar tillbaka.
 *
 * ANTAGANDE: alla talen är satta på känsla. De avgörs av att hålla i en
 * surfplatta, inte av mätdata — se docs/nerskalad.md.
 */
import { Response } from '../training/word-state';

/** Tröskeln i sidled som andel av skärmens bredd, med golv och tak i pixlar. */
export const THRESHOLD_RATIO = 0.22;
export const THRESHOLD_MIN = 60;
export const THRESHOLD_MAX = 130;

/**
 * Tröskeln nedåt, som andel av skärmens *höjd*.
 *
 * Sin egen konstant, och medvetet dyrare än sidled. Två skäl: en nedåtknyck är
 * billigare att göra av misstag än en sidledsknyck — handen rör sig neråt när
 * den slappnar av — och under kortet ligger en sida som rullar. Att ärva
 * sidledstalen rakt av vore att gissa att de två gesterna kostar lika mycket i
 * handen, och det gör de inte.
 *
 * Priset får ändå inte bli så högt att det är billigare att chansa. Se
 * `nextBox()` i word-state.ts för samma avvägning uttryckt i lådor: en ärlig
 * gest som är dyrare än en gissning kommer inte att användas.
 */
export const THRESHOLD_RATIO_Y = 0.14;
export const THRESHOLD_MIN_Y = 80;
export const THRESHOLD_MAX_Y = 170;

/** Hastighet i px/ms som räknas som en knyck även om dragningen är kort. */
export const FLING_SPEED = 0.6;

/** Kortaste dragning en knyck ändå får godkänna. Under den är det en tryckning. */
export const FLING_DISTANCE = 24;

/** Var kortet var, och när. Tas i den ordning de inträffade, nyast sist. */
export interface DragSample {
  /** Avstånd i x från där fingret sattes ned, i pixlar. */
  x: number;
  /** Avstånd i y från där fingret sattes ned. Positivt är nedåt. */
  y: number;
  /** Tidpunkt i millisekunder. Bara skillnaderna används. */
  t: number;
}

/** Axeln en mätning gäller. */
export type Axis = 'x' | 'y';

/** Hur långt kortet måste dras i sidled på en skärm så här bred. */
export function swipeThreshold(viewportWidth: number): number {
  return clamp(viewportWidth * THRESHOLD_RATIO, THRESHOLD_MIN, THRESHOLD_MAX);
}

/** Hur långt kortet måste dras nedåt på en skärm så här hög. */
export function swipeThresholdY(viewportHeight: number): number {
  return clamp(viewportHeight * THRESHOLD_RATIO_Y, THRESHOLD_MIN_Y, THRESHOLD_MAX_Y);
}

/**
 * Farten över de sparade punkterna längs en axel, i px/ms.
 *
 * Mäts från första till sista punkten och inte mellan de två sista: två punkter
 * som råkar ligga en bråkdel av en millisekund isär ger annars en godtyckligt
 * hög fart. Noll när det inte går att mäta.
 */
export function dragSpeed(samples: readonly DragSample[], axis: Axis = 'x'): number {
  if (samples.length < 2) {
    return 0;
  }
  const first = samples[0];
  const last = samples[samples.length - 1];
  const dt = last.t - first.t;
  return dt > 0 ? Math.abs((last[axis] - first[axis]) / dt) : 0;
}

/** Om dragningen var snabb nog att räknas som en knyck längs axeln. */
export function isFling(samples: readonly DragSample[], axis: Axis = 'x'): boolean {
  return dragSpeed(samples, axis) > FLING_SPEED;
}

/**
 * Vilket svar dragningen var, eller `null` om den var en darrning.
 *
 * **Den dominerande axeln avgör.** Sträckorna jämförs som andel av sin egen
 * tröskel, inte i pixlar — annars skulle den billigare axeln vinna varje
 * diagonal bara för att den är billigare. Ett drag som kommit längre *i
 * förhållande till vad som krävs* är det svar tummen var på väg att ge.
 *
 * Uppåt räknas inte som något: `dy` under noll ger ingen dragning på
 * y-axeln, och då avgör sidled — är också den för kort blir svaret `null` och
 * kortet fjädrar tillbaka.
 */
export function commitsSwipe(
  dx: number,
  dy: number,
  samples: readonly DragSample[],
  viewportWidth: number,
  viewportHeight: number,
): Response | null {
  const sideways = Math.abs(dx) / swipeThreshold(viewportWidth);
  const down = Math.max(0, dy) / swipeThresholdY(viewportHeight);

  if (down > sideways) {
    return commits(dy, samples, swipeThresholdY(viewportHeight), 'y') ? 'unsure' : null;
  }
  if (!commits(dx, samples, swipeThreshold(viewportWidth), 'x')) {
    return null;
  }
  return dx > 0 ? 'affirm' : 'deny';
}

function commits(
  distance: number,
  samples: readonly DragSample[],
  threshold: number,
  axis: Axis,
): boolean {
  const far = Math.abs(distance) >= threshold;
  const flicked = isFling(samples, axis) && Math.abs(distance) > FLING_DISTANCE;
  return far || flicked;
}

/** Hur långt kortet dragits i sidled, som -1 till +1 av tröskeln. */
export function swipeProgress(distance: number, viewportWidth: number): number {
  return clamp(distance / swipeThreshold(viewportWidth), -1, 1);
}

/** Hur långt kortet dragits nedåt, som 0 till 1 av tröskeln. Uppåt är noll. */
export function downProgress(distance: number, viewportHeight: number): number {
  return clamp(distance / swipeThresholdY(viewportHeight), 0, 1);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
