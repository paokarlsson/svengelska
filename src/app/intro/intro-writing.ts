/**
 * Startrundans påståenden, skrivna av Claude.
 *
 * Utan nyckel är startrundan fast: samma intressen, samma fem påståenden om
 * hur man vill ha det, samma frön. Med en nyckel skrivs de i stället för den
 * som svarar, i samma stund — när åldern och de fyra första svaren är kända —
 * så att en fyrtiofemåring som lagar mat inte får «Jag skulle vilja åka till
 * rymden» och en tioåring inte får «Jag använder engelska i jobbet».
 *
 * Två sorters påståenden kommer tillbaka, och båda har en mening:
 *
 * - **Påståenden som öppnar något.** Vardagliga och knasiga om vartannat, men
 *   vart och ett med det ordområde «sant» öppnar. De ersätter de fasta
 *   intressena och fröna.
 * - **Påståenden om ett drag.** Ett per drag i `personality.ts`, formulerat för
 *   just den här eleven, med vilket håll «sant» pekar. De ersätter de fasta.
 *
 * Det som inte ersätts är trappan. Den är ett instrument, och ett instrument
 * som skrivs om för varje mätning mäter inte samma sak två gånger.
 *
 * Allt här är rent — ingen nyckel, inget nät. Anropet ligger i
 * `services/intro-writer.ts`.
 */
import { describeLearner } from '../words/generated-list';
import { IntroBatch, WrittenStatement, WrittenTrait } from './intro-run';
import { TRAITS } from './personality';
import { Profile, TRAIT_IDS, TraitId } from './profile';

/** Så många påståenden som öppnar något. Ungefär lika många som de fasta intressena. */
export const STATEMENTS_PER_INTRO = 8;

const TEXT = {
  type: 'string',
  description: 'Ett påstående om eleven i jagform, på svenska, högst tolv ord, utan frågetecken.',
} as const;

export const INTRO_SCHEMA = {
  type: 'object',
  properties: {
    statements: {
      type: 'array',
      description: `${STATEMENTS_PER_INTRO} påståenden, i den ordning de ska visas.`,
      items: {
        type: 'object',
        properties: {
          text: TEXT,
          opens: {
            type: 'string',
            description: 'Ordområdet «sant» öppnar, på svenska, några ord: «bondgården och djuren där».',
          },
        },
        required: ['text', 'opens'],
        additionalProperties: false,
      },
    },
    traits: {
      type: 'array',
      description: 'Ett påstående per drag.',
      items: {
        type: 'object',
        properties: {
          trait: { type: 'string', enum: [...TRAIT_IDS] },
          text: TEXT,
          high: {
            type: 'boolean',
            description: 'Sant om «sant» på påståendet betyder att draget är starkt hos eleven.',
          },
        },
        required: ['trait', 'text', 'high'],
        additionalProperties: false,
      },
    },
  },
  required: ['statements', 'traits'],
  additionalProperties: false,
} as const;

const TRAIT_LIST = TRAITS.map((item) => `- ${item.id}: ${item.means}`).join('\n');

export const INTRO_INSTRUCTIONS = `Du lär känna en svensk elev som ska öva engelska glosor i en app. Svaren används till en enda sak: att välja vilka glosor eleven ska öva, och hur. Ord ur elevens egen vardag och egna intressen är ord eleven vill kunna och kommer ihåg.

Appen visar ett kort i taget med ett påstående om eleven, i jagform, och eleven sveper höger för sant, vänster för falskt och nedåt för att hoppa över. Alla kort i appen är påståenden som är sanna eller falska — aldrig frågor. Mellan dina kort lägger appen riktiga glosor som prov. Du får veta det appen vet hittills: oftast åldern, om eleven övar frivilligt och svaren på de första korten.

Skriv två sorters påståenden.

${STATEMENTS_PER_INTRO} påståenden som var och ett öppnar ett ordområde. Varva det vardagliga med det knasiga: «Jag lagar mat flera gånger i veckan» och «Jag har klappat en ko» hör hemma i samma runda. Knasigt är bra, men varje påstående måste ha en mening: «sant» ska öppna en värld av ord som eleven har nytta av, och det området skriver du i opens. «Jag kan vissla med fingrarna» öppnar ingenting och ska inte skrivas. Sprid ut dem över många olika områden, och gå inte djupare i ett område eleven sagt falskt om. Anpassa dem till åldern: en vuxen ska inte få påståenden om skolan och rasterna, ett barn inte om jobbet.

Ett påstående per drag nedan, som säger något om hur eleven vill öva. Formulera det för just den här eleven, så att det är lätt att veta om det är sant. Säg i high om «sant» betyder att draget är starkt; vänd gärna ett eller två av dem, så att det inte lönar sig att svara sant på allt.
${TRAIT_LIST}

Varje påstående visas ensamt och måste gå att förstå utan de andra. Skriv som en människa pratar: korta påståenden på svenska, högst tolv ord, utan frågetecken. Upprepa inget som redan visats. Fråga aldrig efter namn, var eleven bor eller går i skolan, eller något annat som pekar ut en person, och inte om hälsa, kropp, tro, politik, pengar eller hur familjen har det.`;

/** Frågan till Claude: vad appen vet, och vad som redan visats. */
export function introRequestText(profile: Profile, shown: readonly string[]): string {
  const parts = [describeLearner(profile) ?? 'Appen vet ingenting om eleven än.'];
  if (shown.length > 0) {
    parts.push(`Redan visat — upprepa inget av det:\n${shown.map((text) => `- ${text}`).join('\n')}`);
  }
  return parts.join('\n\n');
}

/**
 * Det som går att använda ur ett svar, eller `null` om ingenting gick.
 *
 * Mötts som all annan text från en modell. Ett påstående utan område faller
 * bort, liksom ett drag som inte finns eller kommer två gånger. Det som saknas
 * fylls av de fasta påståendena — en halv omgång är bättre än ingen.
 */
export function batchFromReply(reply: unknown, shown: readonly string[]): IntroBatch | null {
  if (typeof reply !== 'object' || reply === null || Array.isArray(reply)) {
    return null;
  }
  const raw = reply as Record<string, unknown>;
  const seen = new Set(shown.map((text) => text.toLowerCase()));

  const statements: WrittenStatement[] = [];
  for (const item of Array.isArray(raw['statements']) ? raw['statements'] : []) {
    const record = asRecord(item);
    const text = cleanText(record?.['text']);
    const opens = typeof record?.['opens'] === 'string' ? record['opens'].trim().slice(0, 80) : '';
    if (text !== null && opens.length > 0 && !seen.has(text.toLowerCase())) {
      seen.add(text.toLowerCase());
      statements.push({ text, opens });
    }
  }

  const traits: WrittenTrait[] = [];
  const covered = new Set<TraitId>();
  for (const item of Array.isArray(raw['traits']) ? raw['traits'] : []) {
    const record = asRecord(item);
    const trait = record?.['trait'];
    const text = cleanText(record?.['text']);
    if (
      typeof trait === 'string' &&
      (TRAIT_IDS as readonly string[]).includes(trait) &&
      !covered.has(trait as TraitId) &&
      text !== null &&
      typeof record?.['high'] === 'boolean' &&
      !seen.has(text.toLowerCase())
    ) {
      covered.add(trait as TraitId);
      seen.add(text.toLowerCase());
      traits.push({ trait: trait as TraitId, text, keyed: record['high'] ? 1 : -1 });
    }
  }

  return statements.length === 0 && traits.length === 0 ? null : { statements, traits };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Påståendet utan skiljetecken på slutet, eller `null` om det inte är ett påstående. */
function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const text = value.trim().replace(/[.!]+$/, '');
  // En fråga är inget påstående, hur den än är formulerad.
  return text.length === 0 || text.length > 120 || text.includes('?') ? null : text;
}
