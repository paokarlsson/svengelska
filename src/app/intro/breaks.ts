/**
 * Avbrotten: något helt annat, mitt bland orden.
 *
 * Ett påstående som inte har med engelska att göra — «Jag har sett ett
 * norrsken», «Jag har somnat på ett tåg och missat min hållplats» — lagt mellan
 * glosorna som en paus. Det gör två saker:
 *
 * - **Det bryter av.** Tjugo sant/falskt-kort i rad är ett prov. Ett kort som
 *   inte går att svara fel på, och som man ler åt, gör det till något annat.
 * - **Det är en ingång.** Ett ja till norrskenet säger något som tolv frågor om
 *   intressen inte fångar, och det går att bygga vidare på: nästa avbrott kan
 *   fråga om man fotograferade det, och nästa lista kan handla om vintern i
 *   fjällen. Svaren sparas i profilen och skickas med när listor skrivs.
 *
 * Avbrotten kommer härifrån till att börja med: en hög med frön, några med en
 * följdfråga som visas om svaret var ja. Med en nyckel skriver Claude nya, och
 * bygger då vidare på det som redan svarats — se `services/break-deck.ts`.
 *
 * Allt här är rent.
 */
import { Response } from '../training/word-state';
import { AgeBand, Note } from './profile';

/**
 * Ett frö: påståendet, och vad som frågas nästa gång om svaret var ja.
 *
 * Följdfrågan visas inte direkt efter fröet utan vid nästa avbrott — i
 * startrundan några kort senare, i varven ett helt varv senare. Den måste
 * därför gå att förstå ensam. Här stod först «Jag skulle vilja träffa det»
 * efter «Jag tror att det finns liv på andra planeter», och loggen visade tio
 * sekunders tvekan och ett «hoppa över»: det fanns inget «det» kvar att peka på.
 */
export interface Seed {
  text: string;
  then?: string;
  /** Åldrarna fröet passar. Saknas = alla. */
  ages?: readonly AgeBand[];
}

/**
 * Fröna.
 *
 * Skrivna så att de går att svara på utan att tänka efter, inte pekar ut någon
 * och inte rör hälsa, tro, pengar eller hur familjen har det. Några är dumma
 * med flit. Ett avbrott ska vara ett avbrott.
 *
 * ANTAGANDE: urvalet är satt på känsla.
 */
export const SEEDS: readonly Seed[] = [
  { text: 'Jag har sett ett norrsken', then: 'Jag har stått ute mitt i natten för att se norrsken' },
  { text: 'Jag kan vissla med fingrarna' },
  { text: 'Jag tycker att ananas hör hemma på pizza' },
  {
    text: 'Jag har somnat på ett tåg eller en buss',
    then: 'Jag har missat min hållplats för att jag somnat',
  },
  { text: 'Jag samlar på något', then: 'Jag har fler än hundra saker i en samling' },
  { text: 'Jag har byggt en koja', then: 'Jag har sovit en natt i en koja jag byggt' },
  { text: 'Jag tror att det finns liv på andra planeter', then: 'Jag skulle vilja träffa någon från en annan planet' },
  { text: 'Jag skulle hellre kunna flyga än vara osynlig' },
  { text: 'Jag har klappat en ko' },
  { text: 'Jag har ätit något utan att veta vad det var', then: 'Jag har ätit något okänt som smakade bättre än jag trodde' },
  { text: 'Jag har tappat en mobil i vattnet' },
  { text: 'Jag har lagat något trasigt med tejp', then: 'Jag har en tejpad sak hemma som fortfarande håller' },
  { text: 'Jag har sjungit karaoke', then: 'Jag har sjungit karaoke helt frivilligt' },
  { text: 'Jag kan ett kortkonstnummer' },
  { text: 'Jag har badat utomhus när det var is på sjön' },
  { text: 'Jag vaknar oftast före väckarklockan' },
  { text: 'Jag har gått vilse i en stad', then: 'Jag har hittat rätt i en okänd stad utan karta' },
  { text: 'Jag har en låt som jag aldrig tröttnar på' },
  { text: 'Jag har vunnit något på lotteri eller tävling' },
  { text: 'Jag har sett en älg på riktigt' },
  { text: 'Jag har gjort en snögubbe större än mig själv', ages: ['child', 'teen'] },
  { text: 'Jag har bott i ett tält en hel vecka', ages: ['teen', 'adult'] },
  { text: 'Jag har bytt däck på en bil', ages: ['adult'] },
];

/**
 * Nästa avbrott ur fröna, eller `null` när alla som passar är frågade.
 *
 * Ett ja till ett frö med en följdfråga ger följdfrågan nästa gång — det är så
 * ett avbrott byggs vidare på utan en modell. Annars ett frö som inte frågats.
 */
export function nextBreak(
  asked: readonly Note[],
  age: AgeBand | null,
  random: () => number = Math.random,
): string | null {
  const then = followUpOf(asked);
  if (then !== null) {
    return then;
  }
  const done = new Set(asked.map((note) => note.text));
  const open = SEEDS.filter(
    (seed) =>
      !done.has(seed.text) && (age === null || seed.ages === undefined || seed.ages.includes(age)),
  );
  return open.length === 0 ? null : open[Math.floor(random() * open.length)].text;
}

/** Följdfrågan till det senaste avbrottet, om det var ett ja till ett frö som har en. */
export function followUpOf(asked: readonly Note[]): string | null {
  const last = asked.at(-1);
  if (last === undefined || last.answer !== 'yes') {
    return null;
  }
  const then = SEEDS.find((seed) => seed.text === last.text)?.then;
  return then === undefined || asked.some((note) => note.text === then) ? null : then;
}

/** Svaret på ett avbrott som det sparas. */
export function breakNote(text: string, response: Response): Note {
  return { text, answer: response === 'affirm' ? 'yes' : response === 'deny' ? 'no' : 'unsure' };
}

/** Så många avbrott Claude skriver åt gången. Ett per varv; tre räcker en stund. */
export const BREAKS_PER_REQUEST = 3;

export const BREAK_SCHEMA = {
  type: 'object',
  properties: {
    statements: {
      type: 'array',
      items: {
        type: 'string',
        description: 'Ett påstående om eleven i jagform, på svenska, högst tolv ord.',
      },
      description: `${BREAKS_PER_REQUEST} påståenden, i den ordning de ska visas.`,
    },
  },
  required: ['statements'],
  additionalProperties: false,
} as const;

export const BREAK_INSTRUCTIONS = `Du skriver avbrott till en app där en svensk elev övar engelska glosor. Eleven sveper kort: höger för ja, vänster för nej, nedåt för vet ej. Mitt bland glosorna lägger appen ibland ett kort som inte har med engelska att göra — ett påstående om eleven, i jagform, som man ler åt och svarar på utan att tänka efter. Det är en paus, och det är en ingång: svaren används när appen väljer teman för nya glosor.

Skriv ${BREAKS_PER_REQUEST} sådana påståenden. Ett av dem ska bygga vidare på något eleven sagt ja till — gå ett steg djupare, åt ett oväntat håll: ett ja till «Jag har sett ett norrsken» kan bli «Jag har stått ute i minus tjugo för att se det». De andra ska vara helt nya och gärna oväntade: något man gjort, kan, tycker eller har råkat ut för. Hoppa mellan ämnen; ett avbrott som liknar det förra är inget avbrott.

Varje påstående visas ensamt, ofta ett helt varv efter det det bygger på, och måste gå att förstå utan det. Skriv «Jag skulle vilja träffa en utomjording», inte «Jag skulle vilja träffa det».

Skriv som en människa pratar: korta påståenden på svenska, högst tolv ord, utan frågetecken. Anpassa dem till åldern. Fråga inte om något eleven redan svarat på. Fråga aldrig efter namn, var eleven bor eller går i skolan, eller något annat som pekar ut en person, och inte om hälsa, kropp, tro, politik, pengar eller hur familjen har det.`;

/** Påståendena ur ett svar. Det som inte är en rad text faller bort. */
export function breaksFromReply(reply: unknown, asked: readonly Note[]): string[] {
  if (typeof reply !== 'object' || reply === null || Array.isArray(reply)) {
    return [];
  }
  const raw = (reply as Record<string, unknown>)['statements'];
  if (!Array.isArray(raw)) {
    return [];
  }
  const done = new Set(asked.map((note) => note.text.toLowerCase()));
  const kept: string[] = [];
  for (const item of raw) {
    const text = typeof item === 'string' ? item.trim().replace(/[?.!]+$/, '') : '';
    if (text.length > 0 && text.length <= 120 && !done.has(text.toLowerCase())) {
      done.add(text.toLowerCase());
      kept.push(text);
    }
  }
  return kept;
}
