/**
 * Startrundan: några kort för att lära känna den som ska öva.
 *
 * Samma kort och samma tre svar som resten av appen — höger ja, vänster nej,
 * ner vet ej — och det är halva poängen: den som svarat på «Jag lyssnar på
 * musik varje dag» kan gesten innan det första riktiga ordet kommer.
 *
 * Rundan mäter tre saker, och de blandas med flit:
 *
 * 1. **Vad du gillar.** Påståenden om en själv. Lätta, snabba, och inget av dem
 *    går att svara fel på — rundan börjar med fyra sådana, eftersom det första
 *    en ny användare möter inte ska vara ett prov.
 * 2. **Vem du är.** Ålder och skäl först, eftersom de avgör resten: vilka
 *    intressen som är värda att fråga om, och var provet börjar. Sedan fem
 *    påståenden om hur man vill ha det — se `personality.ts`.
 * 3. **Vad du kan.** En trappa av riktiga kort, från `cat` till ord en van
 *    läsare får tänka efter på. Den börjar där åldern säger att det är troligt
 *    och går upp eller ner tills den hittat kanten.
 *
 * Efter ålder och skäl varvas trappan med de andra korten: ett trappsteg, ett
 * avbrott om något helt annat (se `breaks.ts`), ett påstående, nästa steg. Så var det inte först — då kom tolv frågor om
 * intressen, sedan ålder, sedan provet, och en vuxen som läser engelska till
 * vardags fick börja med `cat` efter att ha svarat på om hen gillar djur.
 *
 * Filen håller sitt eget tillstånd men når varken lagret eller en vy, av samma
 * skäl som `TrainingSession`: reglerna ska gå att pröva utan en skärm.
 */
import { Response } from '../training/word-state';
import { Statement } from '../words/distractors';
import { Random, shuffle } from '../words/shuffle';
import { breakNote, nextBreak } from './breaks';
import { TRAITS, saidOf } from './personality';
import { AgeBand, Note, Profile, Said, TraitId } from './profile';

/** Vilken del av rundan ett kort hör till. Vyn sätter rubrik efter det. */
export type IntroPhase = 'about' | 'you' | 'how' | 'break' | 'words';

/**
 * Ett kort i startrundan.
 *
 * `ask` är ett påstående om en själv, och har inget facit. `probe` är ett
 * riktigt sant/falskt-kort, och döms som ett.
 */
export type IntroCard =
  | { kind: 'ask'; phase: 'about' | 'you' | 'how' | 'break'; id: string; text: string }
  | { kind: 'probe'; phase: 'words'; level: number; statement: Statement };

/** Ett påstående om en själv, och intresset ett ja står för. */
interface About {
  id: string;
  text: string;
  /** Som det ska stå i frågan till modellen. */
  interest: string;
  /** Åldrarna påståendet frågas i. Saknas = alla. */
  ages?: readonly AgeBand[];
}

/**
 * Påståendena om intressen.
 *
 * De fyra första öppnar rundan, innan åldern är känd, och är därför sådana som
 * passar alla. Resten frågas efter åldern: en vuxen tillfrågas om engelska i
 * jobbet, en tioåring om rymden.
 *
 * Några är med flit lite roligare än de behöver vara: «Jag har sett samma film
 * fler än tre gånger» säger samma sak som «Jag gillar film», men den ena är en
 * fråga man ler åt.
 *
 * ANTAGANDE: urvalet är satt på känsla.
 */
export const ABOUT: readonly About[] = [
  { id: 'music', text: 'Jag lyssnar på musik varje dag', interest: 'musik' },
  { id: 'food', text: 'Jag lagar gärna mat', interest: 'mat och matlagning' },
  {
    id: 'film',
    text: 'Jag har sett samma film fler än tre gånger',
    interest: 'film och tv-serier',
  },
  { id: 'travel', text: 'Jag skulle vilja resa jorden runt', interest: 'resor' },
  { id: 'animals', text: 'Jag gillar djur', interest: 'djur' },
  { id: 'games', text: 'Jag spelar gärna spel', interest: 'tv- och datorspel' },
  {
    id: 'space',
    text: 'Jag skulle vilja åka till rymden',
    interest: 'rymden',
    ages: ['child', 'teen'],
  },
  { id: 'sport', text: 'Jag håller på med någon sport', interest: 'sport' },
  {
    id: 'outdoors',
    text: 'Jag är hellre i skogen än i stan',
    interest: 'natur och friluftsliv',
  },
  { id: 'making', text: 'Jag gillar att bygga eller laga saker', interest: 'bygga och teknik' },
  { id: 'books', text: 'Jag läser gärna böcker', interest: 'böcker och berättelser' },
  { id: 'art', text: 'Jag gillar att rita eller skapa', interest: 'att rita och skapa' },
  {
    id: 'news',
    text: 'Jag följer nyheter eller poddar på engelska',
    interest: 'nyheter, samhälle och poddar',
    ages: ['teen', 'adult'],
  },
  {
    id: 'work',
    text: 'Jag använder engelska i jobbet',
    interest: 'engelska i arbetslivet',
    ages: ['adult'],
  },
];

/** Så många intressen som öppnar rundan, innan åldern är känd. */
export const OPENING = 4;

/** Frågorna om ålder och skäl. Id:n som rundan känner igen. */
const TEEN = 'age-13';
const ADULT = 'age-18';
const WHY = 'why';

const YOU: Record<string, string> = {
  [TEEN]: 'Jag har fyllt 13',
  [ADULT]: 'Jag har fyllt 18',
  [WHY]: 'Jag övar för att jag själv vill',
};

/** Ett prov: ordet, vad som visas, och vad som är rätt. */
interface Probe {
  en: string;
  shown: string;
  truth: string;
}

/**
 * Trappan. Två kort per steg — ett sant, ett falskt.
 *
 * Mätstickan för var det är lagom att börja, och den ligger i koden av samma
 * skäl som `EASY_WORDS`: den är ett instrument och ingen läxa. Varje steg ska
 * vara tydligt svårare än det förra, och det falska kortet ska vara en fälla
 * värd namnet — `eventually = eventuellt` och `sensible = sensibel` går den i
 * som tror sig kunna ordet, `conspicuous = misstänksam` den som läser för fort.
 *
 * Två kort och inte ett, eftersom ett sant/falskt-kort är ett myntkast: med två
 * klarar den som gissar ett steg en gång av fyra i stället för varannan.
 *
 * Stegen motsvarar ungefär: 0–1 lågstadiet, 2–3 högstadiet, 4–5 gymnasiet,
 * 6–8 en van läsare av engelsk skönlitteratur.
 *
 * ANTAGANDE: orden och stegen är satta på känsla.
 */
export const LADDER: readonly (readonly [Probe, Probe])[] = [
  [
    { en: 'cat', shown: 'katt', truth: 'katt' },
    { en: 'house', shown: 'bil', truth: 'hus' },
  ],
  [
    { en: 'kitchen', shown: 'kök', truth: 'kök' },
    { en: 'breakfast', shown: 'middag', truth: 'frukost' },
  ],
  [
    { en: 'although', shown: 'fastän', truth: 'fastän' },
    { en: 'nephew', shown: 'farbror', truth: 'brorson' },
  ],
  [
    { en: 'reluctant', shown: 'motvillig', truth: 'motvillig' },
    { en: 'eventually', shown: 'eventuellt', truth: 'till slut' },
  ],
  [
    { en: 'to sue', shown: 'att stämma', truth: 'att stämma' },
    { en: 'sensible', shown: 'sensibel', truth: 'förnuftig' },
  ],
  [
    { en: 'meticulous', shown: 'noggrann', truth: 'noggrann' },
    { en: 'to procrastinate', shown: 'att förutsäga', truth: 'att skjuta upp' },
  ],
  [
    { en: 'to scrutinize', shown: 'att granska', truth: 'att granska' },
    { en: 'conspicuous', shown: 'misstänksam', truth: 'iögonfallande' },
  ],
  [
    { en: 'ubiquitous', shown: 'allestädes närvarande', truth: 'allestädes närvarande' },
    { en: 'sanguine', shown: 'blodtörstig', truth: 'hoppfull' },
  ],
  [
    { en: 'obsequious', shown: 'inställsam', truth: 'inställsam' },
    { en: 'to abscond', shown: 'att avstå', truth: 'att rymma' },
  ],
];

/**
 * Var trappan börjar, efter åldern.
 *
 * Ett steg under det troliga, så att de flesta klarar sitt första prov. Den
 * som inte klarar det går ner ett steg i taget; att börja för högt kostar två
 * kort, att börja vid `cat` kostar en vuxen sex.
 */
const START: Record<AgeBand | 'unknown', number> = {
  child: 0,
  teen: 2,
  adult: 3,
  unknown: 1,
};

/** Så många kort som visas mellan två trappsteg. Avbrottet är ett av dem. */
export const ASKS_BETWEEN = 2;

/**
 * Ungefär så många kort rundan brukar bli. Mätaren räknar mot det tills åldern
 * är känd och den vet bättre: öppningen, ålder och skäl, dragen, intressena som
 * är kvar, och tre trappsteg med var sitt avbrott.
 */
const EXPECTED = OPENING + 3 + TRAITS.length + (ABOUT.length - OPENING - 2) + 6 + 3;

/** Vilken kö ett kort kom ur. */
type Source = 'front' | 'asks' | 'probes' | 'breakCard';

export class IntroRun {
  /** De fasta korten först: öppningen, åldern och skälet. */
  private readonly front: IntroCard[];
  /** Påståendena som varvas med trappan. Fylls när åldern är känd. */
  private readonly asks: IntroCard[] = [];
  /** Trappstegets kort som står på tur. */
  private readonly probes: IntroCard[] = [];
  /** Påståenden kvar att visa innan nästa trappsteg läggs fram. */
  private gap = 0;
  /**
   * Avbrottet som står på tur efter ett trappsteg. Dras en gång och sparas, så
   * att kortet som visas är kortet som besvaras.
   */
  private readonly breakCard: IntroCard[] = [];
  private readonly breakNotes: Note[] = [];
  /** Sant från att trappan börjat tills den hittat kanten. */
  private climbing = false;

  private readonly interests: string[] = [];
  private readonly traits: Partial<Record<TraitId, Said>> = {};
  private age: AgeBand | null = null;
  private voluntary: boolean | null = null;
  /** Steg som höll respektive inte höll. */
  private readonly passed = new Set<number>();
  private readonly failed = new Set<number>();
  /** Steget trappan började på. `null` tills den börjat. */
  private start: number | null = null;
  /** Rätta svar på steget som pågår. */
  private rightOnStep = 0;
  private answers = 0;
  /** Mätaren backar aldrig, även när trappan blir längre än väntat. */
  private shown = 0;

  constructor(private readonly random: Random = Math.random) {
    this.front = [
      ...ABOUT.slice(0, OPENING).map((about): IntroCard => ask('about', about.id, about.text)),
      ask('you', TEEN, YOU[TEEN]),
    ];
  }

  get answered(): number {
    return this.answers;
  }

  get done(): boolean {
    return this.pick() === null;
  }

  /** Andelen av rundan som är avklarad, 0–1. Går aldrig bakåt. */
  get progress(): number {
    if (this.done) {
      return 1;
    }
    const left =
      this.start !== null
        ? this.front.length +
          this.asks.length +
          this.probes.length +
          this.breakCard.length +
          (this.climbing ? 3 : 0)
        : Math.max(1, EXPECTED - this.answers);
    this.shown = Math.max(this.shown, Math.min(0.95, this.answers / (this.answers + left)));
    return this.shown;
  }

  /** Nästa kort, eller `null` när rundan är slut. */
  next(): IntroCard | null {
    return this.pick()?.card ?? null;
  }

  /** Svaret på kortet som låg överst. */
  answer(response: Response): void {
    const picked = this.pick();
    if (picked === null) {
      return;
    }
    const { card, from } = picked;
    this[from].shift();
    this.answers++;

    if (card.kind === 'probe') {
      this.answerProbe(card, response);
    } else if (card.phase === 'about') {
      this.answerAbout(card.id, response);
    } else if (card.phase === 'break') {
      this.breakNotes.push(breakNote(card.text, response));
    } else if (card.phase === 'how') {
      this.traits[card.id as TraitId] = saidOf(card.id as TraitId, response);
    } else {
      this.answerYou(card.id, response);
    }
    if (from === 'asks' || from === 'breakCard') {
      this.gap = Math.max(0, this.gap - 1);
    }
  }

  /** Vad rundan kom fram till. Går att läsa när som helst; det osvarade är `null`. */
  profile(): Profile {
    const profile: Profile = {
      interests: [...this.interests],
      age: this.age,
      voluntary: this.voluntary,
      level: this.level(),
    };
    if (Object.keys(this.traits).length > 0) {
      profile.traits = { ...this.traits };
    }
    if (this.breakNotes.length > 0) {
      profile.breaks = [...this.breakNotes];
    }
    return profile;
  }

  /**
   * Kortet som ligger framme, och kön det ligger i.
   *
   * De fasta korten först. Efter ett trappsteg ett avbrott. Sedan ett
   * trappsteg, när det är dags, och annars ett påstående. Är påståendena slut
   * går trappan i ett svep, och är trappan slut visas påståendena som är kvar.
   */
  private pick(): { card: IntroCard; from: Source } | null {
    if (this.front.length > 0) {
      return { card: this.front[0], from: 'front' };
    }
    if (this.breakCard.length > 0) {
      return { card: this.breakCard[0], from: 'breakCard' };
    }
    if (this.probes.length > 0 && (this.gap === 0 || this.asks.length === 0)) {
      return { card: this.probes[0], from: 'probes' };
    }
    if (this.asks.length > 0) {
      return { card: this.asks[0], from: 'asks' };
    }
    return null;
  }

  /**
   * Hur många steg som höll, räknat från botten.
   *
   * Steg under det trappan började på räknas som hållna — det är vad som gör
   * att en vuxen kan börja vid `reluctant` utan att ha svept `cat`. Höll inget
   * av dem som prövades är nivån det lägsta steget som föll.
   */
  private level(): number | null {
    if (this.start === null) {
      return null;
    }
    if (this.passed.size > 0) {
      return Math.max(...this.passed) + 1;
    }
    return this.failed.size > 0 ? Math.min(...this.failed) : this.start;
  }

  private answerAbout(id: string, response: Response): void {
    const about = ABOUT.find((item) => item.id === id);
    if (about !== undefined && response === 'affirm') {
      this.interests.push(about.interest);
    }
  }

  /**
   * Ålder och skäl.
   *
   * Åldern frågas som en halvering och inte som ett tal: två svep räcker för de
   * tre spann appen har nytta av. Ett «vet ej» på någon av dem betyder «det
   * vill jag inte säga», och då frågas det inte vidare.
   */
  private answerYou(id: string, response: Response): void {
    if (id === TEEN) {
      if (response === 'affirm') {
        this.front.push(ask('you', ADULT, YOU[ADULT]));
        return;
      }
      this.age = response === 'deny' ? 'child' : null;
      this.front.push(ask('you', WHY, YOU[WHY]));
      return;
    }
    if (id === ADULT) {
      this.age = response === 'affirm' ? 'adult' : response === 'deny' ? 'teen' : null;
      this.front.push(ask('you', WHY, YOU[WHY]));
      return;
    }
    if (id === WHY) {
      this.voluntary = response === 'unsure' ? null : response === 'affirm';
      this.begin();
    }
  }

  /**
   * Resten av rundan, nu när åldern är känd: påståendena som passar den, och
   * trappans första steg.
   *
   * Dragen och intressena varvas, ett av vardera, så att det inte blir fem
   * frågor om hur man lär sig i rad.
   */
  private begin(): void {
    const age = this.age;
    const rest = ABOUT.slice(OPENING)
      .filter((about) => age === null || about.ages === undefined || about.ages.includes(age))
      .map((about) => ask('about', about.id, about.text));
    const traits = TRAITS.map((item) => ask('how', item.id, item.text));
    for (let i = 0; i < Math.max(rest.length, traits.length); i++) {
      if (i < traits.length) {
        this.asks.push(traits[i]);
      }
      if (i < rest.length) {
        this.asks.push(rest[i]);
      }
    }
    this.start = START[age ?? 'unknown'];
    this.climbing = true;
    this.queueStep(this.start);
  }

  /**
   * Ett kort i trappan.
   *
   * Steget är klarat när båda korten var rätt. Ett «vet ej» är inte rätt, och
   * det är hela meningen med det tredje svaret: den som inte vet ska kunna säga
   * det i stället för att kasta ett mynt om sin startnivå.
   *
   * Klarat går uppåt och inte klarat nedåt, tills ett klarat steg ligger
   * direkt under ett som inte höll — eller trappan tar slut åt något håll.
   */
  private answerProbe(card: Extract<IntroCard, { kind: 'probe' }>, response: Response): void {
    const right = response !== 'unsure' && (response === 'affirm') === card.statement.truthy;
    if (right) {
      this.rightOnStep++;
    }
    if (this.probes.length > 0) {
      return;
    }

    // Stegets andra kort är besvarat. Nu ett avbrott, innan något annat.
    this.queueBreak();
    const step = card.level;
    if (this.rightOnStep === LADDER[step].length) {
      this.passed.add(step);
      const up = step + 1;
      if (up < LADDER.length && !this.failed.has(up)) {
        this.queueStep(up);
        return;
      }
    } else {
      this.failed.add(step);
      const down = step - 1;
      if (down >= 0 && !this.passed.has(down)) {
        this.queueStep(down);
        return;
      }
    }
    this.climbing = false;
  }

  /**
   * Lägger fram ett avbrott: något helt annat, efter två kort om engelska ord.
   * Se `breaks.ts`. Ett ja kan ge en följdfråga redan vid nästa avbrott.
   */
  private queueBreak(): void {
    const text = nextBreak(this.breakNotes, this.age, this.random);
    if (text !== null) {
      this.breakCard.push(ask('break', 'break', text));
    }
  }

  /**
   * Lägger fram ett trappsteg. Det första direkt efter skälet, resten efter
   * ett avbrott och ett påstående. Ordningen inom steget är slumpad.
   */
  private queueStep(step: number): void {
    this.rightOnStep = 0;
    const first = this.passed.size + this.failed.size === 0;
    this.gap = first ? 0 : ASKS_BETWEEN;
    // Det allra första ordkortet är det sanna. Loggen visade en vuxen som
    // gick från «Jag övar för att jag själv vill» rakt in i fällan
    // `eventually = eventuellt`, tvekade i tjugo sekunder och svepte fel. Det
    // första kortet ska lära ut vad ett ordkort är, inte vara provets svåraste.
    const order = first
      ? [...LADDER[step]].sort((a, b) => Number(b.shown === b.truth) - Number(a.shown === a.truth))
      : shuffle(LADDER[step], this.random);
    for (const probe of order) {
      this.probes.push({ kind: 'probe', phase: 'words', level: step, statement: statementOf(probe) });
    }
  }
}

function ask(phase: 'about' | 'you' | 'how' | 'break', id: string, text: string): IntroCard {
  return { kind: 'ask', phase, id, text };
}

/** Provet som det påstående kortet ritar och dömer. */
function statementOf(probe: Probe): Statement {
  return {
    pair: { en: probe.en, sv: probe.truth },
    direction: 'en',
    asked: probe.en,
    shown: probe.shown,
    truthy: probe.shown === probe.truth,
  };
}

/** Orden på ett trappsteg, för den som ska beskriva nivån med exempel. */
export function wordsOnStep(level: number): string[] {
  return (LADDER[level] ?? []).map((probe) => probe.en);
}
