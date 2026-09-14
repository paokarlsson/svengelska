/**
 * Svepet som gest: när en dragning är ett svar och inte en darrning.
 *
 * Reglerna är `ganger`:s, men de ligger här och inte i komponenten. Skälet är
 * detsamma som överallt annars i appen: det som är en regel ska gå att pröva
 * utan en skärm. `ganger` har samma tre tal inbakade i sin vy och därför inget
 * test på dem, och tal som bara går att pröva med tummen är tal som glider.
 *
 * Två saker får ett drag att räknas som ett svep:
 *
 * 1. **Sträckan.** Kortet dras förbi tröskeln. Tröskeln är en andel av
 *    skärmens bredd och inte ett fast antal pixlar — ett svep ska kosta lika
 *    mycket i handen på en telefon som med en mus på en bred skärm.
 * 2. **Knycken.** Farten är hög nog, även om sträckan är kort. Det är så en
 *    tumme faktiskt sveper: en snärt, inte en resa tvärs över kortet.
 *
 * Knycken har ändå ett golv i sträcka. Utan det blir varje hastig tryckning
 * ett svar, eftersom ett finger som lyfts sällan lyfts helt rakt.
 *
 * ANTAGANDE: alla fyra talen är satta på känsla och ärvda från `ganger`. De
 * avgörs av att hålla i en surfplatta, inte av mätdata — se docs/plan.md.
 */

/** Tröskeln som andel av skärmens bredd, med golv och tak i pixlar. */
export const THRESHOLD_RATIO = 0.22;
export const THRESHOLD_MIN = 60;
export const THRESHOLD_MAX = 130;

/** Hastighet i px/ms som räknas som en knyck även om dragningen är kort. */
export const FLING_SPEED = 0.6;

/** Kortaste dragning en knyck ändå får godkänna. Under den är det en tryckning. */
export const FLING_DISTANCE = 24;

/** Var kortet var, och när. Tas i den ordning de inträffade, nyast sist. */
export interface DragSample {
  /** Avstånd i x från där fingret sattes ned, i pixlar. */
  x: number;
  /** Tidpunkt i millisekunder. Bara skillnaderna används. */
  t: number;
}

/** Hur långt kortet måste dras på en skärm så här bred. */
export function swipeThreshold(viewportWidth: number): number {
  return clamp(viewportWidth * THRESHOLD_RATIO, THRESHOLD_MIN, THRESHOLD_MAX);
}

/**
 * Farten över de sparade punkterna, i px/ms.
 *
 * Mäts från första till sista punkten och inte mellan de två sista: två
 * punkter som råkar ligga en bråkdel av en millisekund isär ger annars en
 * godtyckligt hög fart. Noll när det inte går att mäta.
 */
export function dragSpeed(samples: readonly DragSample[]): number {
  if (samples.length < 2) {
    return 0;
  }
  const first = samples[0];
  const last = samples[samples.length - 1];
  const dt = last.t - first.t;
  return dt > 0 ? Math.abs((last.x - first.x) / dt) : 0;
}

/** Om dragningen var snabb nog att räknas som en knyck. */
export function isFling(samples: readonly DragSample[]): boolean {
  return dragSpeed(samples) > FLING_SPEED;
}

/**
 * Om dragningen ska räknas som ett svar.
 *
 * `distance` är hela sträckan från där fingret sattes ned; `samples` är de
 * senaste punkterna under vägen, för farten.
 */
export function commitsSwipe(
  distance: number,
  samples: readonly DragSample[],
  viewportWidth: number,
): boolean {
  const far = Math.abs(distance) >= swipeThreshold(viewportWidth);
  const flicked = isFling(samples) && Math.abs(distance) > FLING_DISTANCE;
  return far || flicked;
}

/** Hur långt kortet dragits, som -1 till +1 av tröskeln. */
export function swipeProgress(distance: number, viewportWidth: number): number {
  return clamp(distance / swipeThreshold(viewportWidth), -1, 1);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
