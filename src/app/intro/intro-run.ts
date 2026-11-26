/**
 * Startrundan: några kort för att lära känna den som ska öva.
 *
 * Samma kort och samma tre svar som resten av appen — höger ja, vänster nej,
 * ner vet ej — och det är halva poängen: den som svarat på «Jag gillar djur»
 * kan gesten innan det första riktiga ordet kommer.
 *
 * Tre delar, i den här ordningen med flit:
 *
 * 1. **Om dig.** Påståenden om en själv. Lätta, snabba, och inget av dem går
 *    att svara fel på — det första en ny användare möter ska inte vara ett prov.
 * 2. **Ålder och skäl.** Få kort, och de går att hoppa över med «vet ej».
 * 3. **Några ord.** En trappa av riktiga kort, från `cat` till ord en vuxen
 *    får tänka efter på. Den stannar vid första trappsteget som inte höll, så
 *    en nybörjare får två kort och inte tio.
 *
 * Filen håller sitt eget tillstånd men når varken lagret eller en vy, av samma
 * skäl som `TrainingSession`: reglerna ska gå att pröva utan en skärm.
 */
import { Response } from '../training/word-state';
import { Statement } from '../words/distractors';
import { Random, shuffle } from '../words/shuffle';
import { AgeBand, Profile, TOP_LEVEL } from './profile';

/** Vilken del av rundan ett kort hör till. Vyn sätter rubrik efter det. */
export type IntroPhase = 'about' | 'you' | 'words';

/**
 * Ett kort i startrundan.
 *
 * `ask` är ett påstående om en själv, och har inget facit. `probe` är ett
 * riktigt sant/falskt-kort, och döms som ett.
 */
export type IntroCard =
  | { kind: 'ask'; phase: 'about' | 'you'; id: string; text: string }
  | { kind: 'probe'; phase: 'words'; level: number; statement: Statement };

/** Ett påstående om en själv, och intresset ett ja står för. */
interface About {
  id: string;
  text: string;
  /** Som det ska stå i frågan till modellen. */
  interest: string;
}

/**
 * Påståendena.
 *
 * Skrivna så att både en tioåring och en fyrtiofemåring kan svara ja utan att
 * känna sig tilltalad som den andra. Några är med flit lite roligare än de
 * behöver vara: «Jag har sett samma film fler än tre gånger» säger samma sak
 * som «Jag gillar film», men den ena är en fråga man ler åt.
 *
 * ANTAGANDE: urvalet är satt på känsla.
 */
export const ABOUT: readonly About[] = [
  { id: 'animals', text: 'Jag gillar djur', interest: 'djur' },
  { id: 'games', text: 'Jag spelar gärna spel', interest: 'tv- och datorspel' },
  { id: 'space', text: 'Jag skulle vilja åka till rymden', interest: 'rymden' },
  { id: 'food', text: 'Jag lagar gärna mat', interest: 'mat och matlagning' },
  { id: 'sport', text: 'Jag håller på med någon sport', interest: 'sport' },
  { id: 'music', text: 'Jag lyssnar på musik varje dag', interest: 'musik' },
  {
    id: 'film',
    text: 'Jag har sett samma film fler än tre gånger',
    interest: 'film och tv-serier',
  },
  {
    id: 'outdoors',
    text: 'Jag är hellre i skogen än i stan',
    interest: 'natur och friluftsliv',
  },
  { id: 'making', text: 'Jag gillar att bygga eller laga saker', interest: 'bygga och teknik' },
  { id: 'travel', text: 'Jag skulle vilja resa jorden runt', interest: 'resor' },
  { id: 'books', text: 'Jag läser gärna böcker', interest: 'böcker och berättelser' },
  { id: 'art', text: 'Jag gillar att rita eller skapa', interest: 'att rita och skapa' },
];

/** Frågorna som inte är intressen. Id:n som rundan känner igen. */
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
 * värd namnet — `eventually = eventuellt` går den i som tror sig kunna ordet.
 *
 * Två kort och inte ett, eftersom ett sant/falskt-kort är ett myntkast: med två
 * klarar den som gissar ett steg en gång av fyra i stället för varannan.
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
    { en: 'meticulous', shown: 'noggrann', truth: 'noggrann' },
    { en: 'to procrastinate', shown: 'att förutsäga', truth: 'att skjuta upp' },
  ],
];

/** Så många kort rundan är som mest. Mätaren räknar mot det. */
export const MAX_CARDS = ABOUT.length + Object.keys(YOU).length + LADDER.length * 2;

export class IntroRun {
  /** Korten som står på tur. Fylls på när ett svar öppnar en ny gren. */
  private readonly queue: IntroCard[];
  private readonly interests: string[] = [];
  private age: AgeBand | null = null;
  private voluntary: boolean | null = null;
  /** `null` tills trappan börjat. */
  private level: number | null = null;
  /** Rätta svar på steget som pågår. */
  private rightOnStep = 0;
  private answers = 0;

  constructor(private readonly random: Random = Math.random) {
    this.queue = [
      ...ABOUT.map((about): IntroCard => ask('about', about.id, about.text)),
      ask('you', TEEN, YOU[TEEN]),
    ];
  }

  get answered(): number {
    return this.answers;
  }

  get done(): boolean {
    return this.queue.length === 0;
  }

  /** Andelen av rundan som är avklarad, 0–1. Hoppar fram när trappan tar slut i förtid. */
  get progress(): number {
    return this.done ? 1 : Math.min(1, this.answers / MAX_CARDS);
  }

  /** Nästa kort, eller `null` när rundan är slut. */
  next(): IntroCard | null {
    return this.queue[0] ?? null;
  }

  /** Svaret på kortet som låg överst. */
  answer(response: Response): void {
    const card = this.queue.shift();
    if (card === undefined) {
      return;
    }
    this.answers++;

    if (card.kind === 'probe') {
      this.answerProbe(card, response);
    } else if (card.phase === 'about') {
      this.answerAbout(card.id, response);
    } else {
      this.answerYou(card.id, response);
    }
  }

  /** Vad rundan kom fram till. Går att läsa när som helst; det osvarade är `null`. */
  profile(): Profile {
    return {
      interests: [...this.interests],
      age: this.age,
      voluntary: this.voluntary,
      level: this.level,
    };
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
        this.queue.push(ask('you', ADULT, YOU[ADULT]));
        return;
      }
      this.age = response === 'deny' ? 'child' : null;
      this.queue.push(ask('you', WHY, YOU[WHY]));
      return;
    }
    if (id === ADULT) {
      this.age = response === 'affirm' ? 'adult' : response === 'deny' ? 'teen' : null;
      this.queue.push(ask('you', WHY, YOU[WHY]));
      return;
    }
    if (id === WHY) {
      this.voluntary = response === 'unsure' ? null : response === 'affirm';
      this.level = 0;
      this.queueStep(0);
    }
  }

  /**
   * Ett kort i trappan.
   *
   * Steget är klarat när båda korten var rätt. Ett «vet ej» är inte rätt, och
   * det är hela meningen med det tredje svaret: den som inte vet ska kunna säga
   * det i stället för att kasta ett mynt om sin startnivå.
   */
  private answerProbe(card: Extract<IntroCard, { kind: 'probe' }>, response: Response): void {
    const right = response !== 'unsure' && (response === 'affirm') === card.statement.truthy;
    if (right) {
      this.rightOnStep++;
    }
    if (this.queue.length > 0) {
      return;
    }

    // Stegets andra kort är besvarat.
    if (this.rightOnStep === LADDER[card.level].length) {
      this.level = card.level + 1;
      this.queueStep(card.level + 1);
    }
  }

  /** Lägger fram ett trappsteg, om det finns. Ordningen inom steget är slumpad. */
  private queueStep(level: number): void {
    this.rightOnStep = 0;
    if (level >= TOP_LEVEL || level >= LADDER.length) {
      return;
    }
    for (const probe of shuffle(LADDER[level], this.random)) {
      this.queue.push({ kind: 'probe', phase: 'words', level, statement: statementOf(probe) });
    }
  }
}

function ask(phase: 'about' | 'you', id: string, text: string): IntroCard {
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
