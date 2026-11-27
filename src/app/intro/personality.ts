/**
 * Personligheten: fem drag som ändrar vilka ord någon har nytta av.
 *
 * Inte en personlighetstest i allmänhet. Varje drag är med för att det ändrar
 * något i en lista — hur långt över nivån orden läggs, om ett udda ord är en
 * glädje eller ett hinder, hur felsvaren behöver se ut — och ett drag som inte
 * ändrade något vore en fråga i onödan.
 *
 * Två källor, och de vägs ihop vid läsning:
 *
 * - **Vad någon säger.** Ett påstående per drag i startrundan, svept som alla
 *   andra kort. Snabbt, och det enda som finns innan första varvet.
 * - **Vad någon gör.** Två av dragen syns i övningen: den som avbryter varv
 *   när det tar emot, och den som chansar i stället för att säga vet ej. Där
 *   tar beteendet över i takt med att det blir mer av det — trettio varv säger
 *   mer än ett svep i startrundan.
 *
 * Allt här är rent. Vad som lagras står i `profile.ts`.
 */
import { Habits, Profile, Said, TRAIT_IDS, TraitId } from './profile';

export interface Trait {
  id: TraitId;
  /** Påståendet i startrundan. */
  text: string;
  /**
   * Vad ett ja betyder för draget: 1 om det talar för det, −1 om emot.
   *
   * Två av påståendena är vända med flit. «Jag tröttnar fort» är lättare att
   * svara ärligt på än «Jag ger inte upp», som de flesta skulle vilja säga ja
   * till oavsett.
   */
  keyed: 1 | -1;
  /** Vad modellen får veta när draget är starkt, och när dess motsats är det. */
  high: string;
  low: string;
  /** Som det sägs till den som övar, på kortet efter startrundan. */
  sayHigh: string;
  sayLow: string;
}

/** ANTAGANDE: påståendena och vad de får betyda är satta på känsla. */
export const TRAITS: readonly Trait[] = [
  {
    id: 'challenge',
    text: 'Det får gärna vara svårt, bara det inte är tråkigt',
    keyed: 1,
    high: 'Vill ha motstånd. Lägg hellre orden för svårt än för lätt — ett ord eleven redan kan är ett slösat kort.',
    low: 'Vill känna att det går. Lägg de flesta orden på nivån och ett par under, så att listan inte bara är motstånd.',
    sayHigh: 'du vill ha motstånd',
    sayLow: 'du vill känna att det går',
  },
  {
    id: 'playful',
    text: 'Jag gillar ordvitsar och konstiga ord',
    keyed: 1,
    high: 'Gillar ordlek och udda ord. Ta gärna med ett par glosor som är roliga i sig, eller ett idiom.',
    low: 'Vill ha raka ord utan krumelurer.',
    sayHigh: 'du gillar udda ord',
    sayLow: 'du vill ha raka ord',
  },
  {
    id: 'practical',
    text: 'Jag vill kunna använda orden direkt',
    keyed: 1,
    high: 'Vill ha ord att använda direkt: vardagliga och användbara före ovanliga.',
    low: 'Lockas av ovanliga ord, inte bara de nyttigaste.',
    sayHigh: 'du vill ha ord du kan använda',
    sayLow: 'du gillar ovanliga ord',
  },
  {
    id: 'persistent',
    text: 'Jag tröttnar fort om jag inte kan',
    keyed: -1,
    high: 'Ger sig inte i första taget.',
    low: 'Tröttnar när det tar emot. Börja listan med ett par ord som sitter direkt, och gör den inte svårare än den behöver vara.',
    sayHigh: 'du ger dig inte i första taget',
    sayLow: 'det ska inte ta emot för länge',
  },
  {
    id: 'careful',
    text: 'Jag chansar hellre än säger att jag inte vet',
    keyed: -1,
    high: 'Säger hellre vet ej än chansar.',
    low: 'Chansar hellre än säger vet ej. Gör felsvaren så troliga att de inte går att avfärda på känn.',
    sayHigh: 'du säger hellre vet ej än chansar',
    sayLow: 'du chansar hellre än säger vet ej',
  },
];

/** Draget bakom ett id. */
export function trait(id: TraitId): Trait {
  return TRAITS.find((item) => item.id === id)!;
}

/** Vad ett svep på dragets påstående säger om draget. */
export function saidOf(id: TraitId, response: 'affirm' | 'deny' | 'unsure'): Said {
  if (response === 'unsure') {
    return 0;
  }
  const keyed = trait(id).keyed;
  return (response === 'affirm' ? keyed : -keyed) as Said;
}

/**
 * Så mycket beteende som väger lika mycket som det någon sa om sig själv.
 *
 * Räknat i varv för uthålligheten och i svar för försiktigheten. Ett varv är
 * en större händelse än ett svar, därav de olika talen.
 *
 * ANTAGANDE: satta på känsla.
 */
const EVEN = { persistent: 4, careful: 12 } as const;

/** Under så här mycket beteende räknas det inte alls — ett varv är ingen vana. */
const MIN_SEEN = { persistent: 2, careful: 5 } as const;

/**
 * Vad beteendet säger om ett drag, −1 till 1, och hur mycket det är att gå på.
 * `null` för de drag som inte syns i övningen, och när för lite har setts.
 */
export function observed(id: TraitId, habits: Habits | undefined): { value: number; seen: number } | null {
  if (habits === undefined) {
    return null;
  }
  if (id === 'persistent') {
    const seen = habits.finished + habits.left;
    if (seen < MIN_SEEN.persistent) {
      return null;
    }
    // Att lämna vart fjärde varv är mycket. De flesta spelar klart nästan
    // alltid, så skalan är lagd kring det: inget lämnat är 1, vart fjärde 0.
    return { value: clamp(1 - (4 * habits.left) / seen), seen };
  }
  if (id === 'careful') {
    const seen = habits.misses + habits.unsure;
    if (seen < MIN_SEEN.careful) {
      return null;
    }
    return { value: (habits.unsure - habits.misses) / seen, seen };
  }
  return null;
}

/**
 * Draget som appen tror på just nu, −1 till 1, eller `null` om inget vet.
 *
 * Det sagda och det sedda vägs mot varandra, och det sedda väger tyngre ju mer
 * av det det finns. Den som sa att hen aldrig chansar men har trettio fel och
 * två «vet ej» chansar.
 */
export function traitValue(profile: Profile, id: TraitId): number | null {
  const said = profile.traits?.[id];
  const seen = observed(id, profile.habits);
  if (seen === null) {
    return said ?? null;
  }
  if (said === undefined) {
    return seen.value;
  }
  const even = EVEN[id as keyof typeof EVEN];
  const weight = seen.seen / (seen.seen + even);
  return said * (1 - weight) + seen.value * weight;
}

/** Över så här är ett drag starkt nog att nämnas. Ett «vet ej» är det aldrig. */
const STRONG = 0.34;

/** Dragen som är starka nog att nämnas, åt vilket håll, i `TRAITS`-ordning. */
export function strongTraits(profile: Profile): { trait: Trait; high: boolean }[] {
  const strong: { trait: Trait; high: boolean }[] = [];
  for (const id of TRAIT_IDS) {
    const value = traitValue(profile, id);
    if (value !== null && Math.abs(value) >= STRONG) {
      strong.push({ trait: trait(id), high: value > 0 });
    }
  }
  return strong;
}

/** Personligheten som modellen får läsa den, en rad per starkt drag. */
export function describePersonality(profile: Profile): string[] {
  return strongTraits(profile).map(({ trait: item, high }) => (high ? item.high : item.low));
}

/**
 * Personligheten som den sägs till den som övar. Högst `limit` drag, så att
 * kortet efter startrundan inte blir en lång uppräkning.
 */
export function sayPersonality(profile: Profile, limit = 2): string | null {
  const said = strongTraits(profile)
    .slice(0, limit)
    .map(({ trait: item, high }) => (high ? item.sayHigh : item.sayLow));
  if (said.length === 0) {
    return null;
  }
  const sentence = said.length === 1 ? said[0] : `${said.slice(0, -1).join(', ')} och ${said.at(-1)}`;
  return `Jag tror att ${sentence}.`;
}

function clamp(value: number): number {
  return Math.max(-1, Math.min(1, value));
}
