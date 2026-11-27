/**
 * Följdfrågorna: det startrundan inte hann fråga, skrivet av Claude.
 *
 * Startrundans tolv påståenden är breda med flit — de ska gå att svara på för
 * vem som helst. Men «Jag lagar gärna mat» säger inte om det är bakning,
 * grillning eller restaurangkök, och det är just det som avgör vilka glosor
 * någon har nytta av. Den som säger att appen inte vet nog om hen får därför
 * fler påståenden, skrivna utifrån det hen redan svarat.
 *
 * **Ett träd, tre steg fram.** Claude skriver inte en fråga i taget utan ett
 * träd: en första fråga, en följdfråga för ja och en för nej, och under var och
 * en av dem två till. Eleven ser bara vägen svaren leder — tre kort — men alla
 * sju finns redan när det första visas. Därför väntar ingen mellan korten.
 * Medan de två sista besvaras skrivs nästa träd, så att flytet håller även över
 * skarven.
 *
 * Allt här är rent — ingen nyckel, inget nät. Anropet ligger i
 * `services/follow-up-writer.ts`.
 */
import { Response } from '../training/word-state';
import { describeLearner } from '../words/generated-list';
import { Note, Profile } from './profile';

/** Så många frågor ett träd är djupt: så många kort eleven ser per träd. */
export const TREE_DEPTH = 3;

/** En fråga och vart svaren leder. Löven har inga grenar. */
export interface QuestionNode {
  text: string;
  yes: QuestionNode | null;
  no: QuestionNode | null;
}

/** Ett påstående i jagform. Delas av alla nivåer i schemat. */
const TEXT = {
  type: 'string',
  description: 'Ett påstående om eleven i jagform, på svenska, högst tio ord.',
} as const;

/** Ett nivå i taget, eftersom schemat inte får peka på sig självt. */
const LEAF = {
  type: 'object',
  properties: { text: TEXT },
  required: ['text'],
  additionalProperties: false,
} as const;

function branch<T>(child: T) {
  return {
    type: 'object',
    properties: {
      text: TEXT,
      yes: { ...child, description: 'Nästa påstående om eleven svarar ja.' },
      no: { ...child, description: 'Nästa påstående om eleven svarar nej eller vet ej.' },
    },
    required: ['text', 'yes', 'no'],
    additionalProperties: false,
  } as const;
}

/** Formen svaret måste ha: ett träd med tre nivåer. */
export const FOLLOW_UP_SCHEMA = branch(branch(LEAF));

/**
 * Uppdraget. Skrivet som en förklaring, av samma skäl som `LIST_INSTRUCTIONS`:
 * den som förstår vad svaren används till väljer rätt fråga även där ingen
 * regel säger något.
 */
export const FOLLOW_UP_INSTRUCTIONS = `Du lär känna en svensk elev som ska öva engelska glosor i en app. Svaren används till en enda sak: att välja vilka glosor eleven ska öva. Ord ur elevens egen vardag och egna intressen är ord eleven vill kunna och kommer ihåg.

Appen visar ett påstående i taget om eleven, i jagform, och eleven sveper höger för ja, vänster för nej och nedåt för vet ej. Du får veta vad appen vet hittills.

Skriv ett träd med tre påståenden i följd: ett första, ett att visa om eleven svarar ja och ett om hen svarar nej eller vet ej, och under vart och ett av dem samma sak en gång till. Eleven ser bara den väg svaren leder: tre kort. Alla sju ska alltså vara värda att visa.

Varje påstående ska smalna av, så att svaret säger något nytt om vilka ord eleven har nytta av. Gå från det breda mot det konkreta — från «Jag lagar gärna mat» till «Jag bakar oftare än jag lagar middag» till «Jag har bakat surdegsbröd». Ett nej betyder att den vägen är stängd: byt riktning i stället för att fråga samma sak i en annan form. Börja gärna där appen vet minst, eller där ett ja ännu är brett.

Fråga inte om något eleven redan svarat på, och inte om det som står bland de påståenden som visas härnäst.

Skriv som en människa pratar: korta påståenden i jagform, på svenska, högst tio ord, utan frågetecken, och så att de går att svara ja eller nej på utan att tänka efter. Anpassa dem till åldern. Fråga aldrig efter namn, var eleven bor eller går i skolan, eller något annat som pekar ut en person, och inte om hälsa, tro, politik eller hur familjen har det.`;

/**
 * Frågan till Claude.
 *
 * `upcoming` är påståendena som redan står på tur i det träd som pågår. Det
 * nya trädet skrivs medan de besvaras, och ska fortsätta efter dem — inte
 * upprepa dem.
 */
export function followUpRequestText(profile: Profile, upcoming: readonly string[]): string {
  const parts = [describeLearner(profile) ?? 'Appen vet ingenting om eleven än.'];
  if (upcoming.length > 0) {
    parts.push(
      `Visas härnäst, oavsett vad du skriver — upprepa dem inte:\n${upcoming.map((text) => `- ${text}`).join('\n')}`,
    );
  }
  return parts.join('\n\n');
}

/**
 * Trädet ur ett svar, eller `null` om det inte gick att göra ett träd av.
 *
 * Mötts som all annan text från en modell: det som går att känna igen behålls.
 * En gren som saknas eller är tom blir ett löv, så att ett halvt träd fortfarande
 * ger de frågor det har. Saknas roten finns inget träd.
 */
export function treeFromReply(reply: unknown, depth: number = TREE_DEPTH): QuestionNode | null {
  if (depth <= 0 || typeof reply !== 'object' || reply === null || Array.isArray(reply)) {
    return null;
  }
  const raw = reply as Record<string, unknown>;
  const text = typeof raw['text'] === 'string' ? raw['text'].trim() : '';
  if (text.length === 0) {
    return null;
  }
  return {
    text,
    yes: treeFromReply(raw['yes'], depth - 1),
    no: treeFromReply(raw['no'], depth - 1),
  };
}

/**
 * En väg genom ett träd: vilket kort som ligger framme, och vad svaret betydde.
 *
 * Ett «vet ej» följer nej-grenen. Det är inte ett nej, och sparas inte som ett,
 * men det öppnar inte heller den väg ett ja hade öppnat.
 */
export class TreeWalk {
  private node: QuestionNode | null;
  private readonly answers: Note[] = [];

  constructor(root: QuestionNode) {
    this.node = root;
  }

  /** Påståendet som ligger framme, eller `null` när vägen är gången. */
  get current(): string | null {
    return this.node?.text ?? null;
  }

  get done(): boolean {
    return this.node === null;
  }

  /** Svaren hittills, i ordning. */
  get notes(): readonly Note[] {
    return this.answers;
  }

  /** Svaret på kortet som ligger framme. Ger svaret som det sparas. */
  answer(response: Response): Note | null {
    const node = this.node;
    if (node === null) {
      return null;
    }
    const note: Note = { text: node.text, answer: NOTE_OF[response] };
    this.answers.push(note);
    this.node = response === 'affirm' ? node.yes : node.no;
    return note;
  }

  /**
   * Allt som fortfarande *kan* visas, kortet som ligger framme inräknat.
   *
   * Det är vad nästa träd inte får upprepa: vilken gren som blir av vet ingen
   * än, så båda nämns.
   */
  upcoming(): string[] {
    const texts: string[] = [];
    const collect = (node: QuestionNode | null): void => {
      if (node !== null) {
        texts.push(node.text);
        collect(node.yes);
        collect(node.no);
      }
    };
    collect(this.node);
    return texts;
  }
}

const NOTE_OF: Record<Response, Note['answer']> = {
  affirm: 'yes',
  deny: 'no',
  unsure: 'unsure',
};
