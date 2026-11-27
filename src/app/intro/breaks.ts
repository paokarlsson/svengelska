/**
 * Avbrotten: något helt annat, mitt bland orden.
 *
 * Ett påstående som inte har med engelska att göra — «Jag har sett ett
 * norrsken», «Jag har somnat på ett tåg» — lagt mellan glosorna. Det står
 * inte «avbrott» på kortet: för den som sveper är det bara nästa kort, och
 * det ska kännas som en fråga och inte som en reklampaus.
 *
 * Knasigt får det vara, men aldrig meningslöst. Varje avbrott finns för att ett
 * ja *öppnar* något: en värld av ord som eleven har nytta av och kommer ihåg
 * för att den är hens egen. «Jag har klappat en ko» öppnar bondgården, «Jag har
 * lagat något med tejp» verktygslådan. Det står på varje frö (`opens`), följer
 * med svaret in i profilen, och är vad modellen får läsa när den väljer tema
 * för nästa lista.
 *
 * Det bryter också av. Tjugo sant/falskt-kort i rad är ett prov; ett kort som
 * inte går att svara fel på, och som man ler åt, gör det till något annat.
 *
 * Avbrotten kommer härifrån till att börja med: en hög med frön, några med en
 * följdfråga som visas om svaret var ja. Med en nyckel skriver Claude nya, och
 * bygger då vidare på det som redan svarats — se `services/break-deck.ts`.
 *
 * Allt här är rent.
 */
import { Response } from '../training/word-state';
import { AgeBand, Note } from './profile';

/** Ett avbrott: påståendet, och ordområdet ett ja öppnar. */
export interface Break {
  text: string;
  opens: string;
}

/**
 * Ett frö: ett avbrott, och vad som frågas nästa gång om svaret var ja.
 *
 * Följdfrågan öppnar samma område som fröet, en bit djupare. Den visas inte
 * direkt efter fröet utan vid nästa avbrott — i startrundan några kort senare,
 * i varven ett helt varv senare — och måste därför gå att förstå ensam. Här
 * stod först «Jag skulle vilja träffa det» efter «Jag tror att det finns liv på
 * andra planeter», och loggen visade tio sekunders tvekan och ett «hoppa över».
 */
export interface Seed extends Break {
  then?: string;
  /** Åldrarna fröet passar. Saknas = alla. */
  ages?: readonly AgeBand[];
}

/**
 * Fröna.
 *
 * Skrivna så att de går att svara på utan att tänka efter, inte pekar ut någon
 * och inte rör hälsa, tro, pengar eller hur familjen har det. Ett frö utan ett
 * område det öppnar hör inte hit, hur roligt det än är: «Jag kan vissla med
 * fingrarna» stod här först, och ett ja till det säger inget om vilka ord
 * någon vill kunna.
 *
 * ANTAGANDE: urvalet är satt på känsla.
 */
export const SEEDS: readonly Seed[] = [
  {
    text: 'Jag har sett ett norrsken',
    opens: 'vinter, natthimmel och kyla',
    then: 'Jag har stått ute mitt i natten för att se norrsken',
  },
  { text: 'Jag har skrikit mig hes på en match', opens: 'sport, publik och tävling' },
  { text: 'Jag tycker att ananas hör hemma på pizza', opens: 'mat, smaker och att äta ute' },
  {
    text: 'Jag har somnat på ett tåg eller en buss',
    opens: 'resor och kollektivtrafik',
    then: 'Jag har missat min hållplats för att jag somnat',
  },
  {
    text: 'Jag samlar på något',
    opens: 'samlingar och hobbyer',
    then: 'Jag har fler än hundra saker i en samling',
  },
  {
    text: 'Jag har byggt en koja',
    opens: 'skogen, verktyg och att bygga',
    then: 'Jag har sovit en natt i en koja jag byggt',
  },
  {
    text: 'Jag tror att det finns liv på andra planeter',
    opens: 'rymden och science fiction',
    then: 'Jag skulle vilja träffa någon från en annan planet',
  },
  { text: 'Jag skulle hellre kunna flyga än vara osynlig', opens: 'superkrafter, fantasy och hjältar' },
  { text: 'Jag har klappat en ko', opens: 'bondgården och djuren där' },
  {
    text: 'Jag har ätit något utan att veta vad det var',
    opens: 'mat från andra länder',
    then: 'Jag har ätit något okänt som smakade bättre än jag trodde',
  },
  { text: 'Jag har tappat en mobil i vattnet', opens: 'mobiler, teknik och saker som går sönder' },
  {
    text: 'Jag har lagat något trasigt med tejp',
    opens: 'verktyg och att laga saker',
    then: 'Jag har en tejpad sak hemma som fortfarande håller',
  },
  {
    text: 'Jag har sjungit karaoke',
    opens: 'musik, sång och scen',
    then: 'Jag har sjungit karaoke helt frivilligt',
  },
  { text: 'Jag kan ett kortkonstnummer', opens: 'trolleri, kortspel och spel' },
  { text: 'Jag har badat utomhus när det var is på sjön', opens: 'väder, vatten och vinterbad' },
  { text: 'Jag vaknar oftast före väckarklockan', opens: 'morgnar, sömn och vardagsrutiner' },
  {
    text: 'Jag har gått vilse i en stad',
    opens: 'städer och att hitta vägen',
    then: 'Jag har hittat rätt i en okänd stad utan karta',
  },
  { text: 'Jag har en låt som jag aldrig tröttnar på', opens: 'musik och känslor' },
  { text: 'Jag har vunnit något på lotteri eller tävling', opens: 'tävlingar, tur och spel' },
  { text: 'Jag har sett en älg på riktigt', opens: 'skogens djur' },
  {
    text: 'Jag har gjort en snögubbe större än mig själv',
    opens: 'snö och vinterlek',
    ages: ['child', 'teen'],
  },
  {
    text: 'Jag har bott i ett tält en hel vecka',
    opens: 'camping och friluftsliv',
    ages: ['teen', 'adult'],
  },
  { text: 'Jag har bytt däck på en bil', opens: 'bilar och verkstaden', ages: ['adult'] },
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
): Break | null {
  const then = followUpOf(asked);
  if (then !== null) {
    return then;
  }
  const done = new Set(asked.map((note) => note.text));
  const open = SEEDS.filter(
    (seed) =>
      !done.has(seed.text) && (age === null || seed.ages === undefined || seed.ages.includes(age)),
  );
  return open.length === 0 ? null : asBreak(open[Math.floor(random() * open.length)]);
}

/** Följdfrågan till det senaste avbrottet, om det var ett ja till ett frö som har en. */
export function followUpOf(asked: readonly Note[]): Break | null {
  const last = asked.at(-1);
  if (last === undefined || last.answer !== 'yes') {
    return null;
  }
  const seed = SEEDS.find((item) => item.text === last.text);
  const then = seed?.then;
  if (seed === undefined || then === undefined || asked.some((note) => note.text === then)) {
    return null;
  }
  return { text: then, opens: seed.opens };
}

/** Svaret på ett avbrott som det sparas: med området, så att modellen vet varför det frågades. */
export function breakNote(item: Break, response: Response): Note {
  const answer = response === 'affirm' ? 'yes' : response === 'deny' ? 'no' : 'unsure';
  return { text: item.text, answer, opens: item.opens };
}

function asBreak(seed: Seed): Break {
  return { text: seed.text, opens: seed.opens };
}

/** Så många avbrott Claude skriver åt gången. Ett per varv; tre räcker en stund. */
export const BREAKS_PER_REQUEST = 3;

export const BREAK_SCHEMA = {
  type: 'object',
  properties: {
    breaks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'Ett påstående om eleven i jagform, på svenska, högst tolv ord.',
          },
          opens: {
            type: 'string',
            description:
              'Ordområdet «sant» öppnar, på svenska, några ord: «bondgården och djuren där».',
          },
        },
        required: ['text', 'opens'],
        additionalProperties: false,
      },
      description: `${BREAKS_PER_REQUEST} avbrott, i den ordning de ska visas.`,
    },
  },
  required: ['breaks'],
  additionalProperties: false,
} as const;

export const BREAK_INSTRUCTIONS = `Du skriver avbrott till en app där en svensk elev övar engelska glosor. Eleven sveper kort: höger för sant, vänster för falskt, nedåt för att hoppa över. Alla kort i appen är påståenden som är sanna eller falska — aldrig frågor. Mitt bland glosorna lägger appen ibland ett kort som inte har med engelska att göra — ett påstående om eleven, i jagform, som man ler åt och svarar på utan att tänka efter. Kortet presenteras inte som något särskilt; för eleven är det bara nästa kort.

Knasigt är bra, men varje påstående måste ha en mening: ett «sant» ska öppna en värld av ord som eleven har nytta av. Svaren används till en enda sak — att välja teman för nya glosor — och ett påstående vars «sant» inte säger något om vilka ord eleven vill kunna är ett slösat kort, hur roligt det än är. «Jag har klappat en ko» öppnar bondgården; «Jag kan vissla med fingrarna» öppnar ingenting. Skriv i opens vilket ordområde ett «sant» öppnar.

Skriv ${BREAKS_PER_REQUEST} sådana påståenden. Ett av dem ska bygga vidare på något eleven svarat sant på — gå ett steg djupare i samma område, åt ett oväntat håll: «sant» på «Jag har sett ett norrsken» kan bli «Jag har stått ute i minus tjugo för att se norrsken». De andra ska vara helt nya och gärna oväntade: något man gjort, kan, tycker eller har råkat ut för, och gärna i ett område appen inte vet något om än. Hoppa mellan områden; ett avbrott som liknar det förra är inget avbrott.

Varje påstående visas ensamt, ofta ett helt varv efter det det bygger på, och måste gå att förstå utan det. Skriv «Jag skulle vilja träffa en utomjording», inte «Jag skulle vilja träffa det».

Skriv som en människa pratar: korta påståenden på svenska, högst tolv ord, utan frågetecken. Anpassa dem till åldern. Fråga inte om något eleven redan svarat på. Fråga aldrig efter namn, var eleven bor eller går i skolan, eller något annat som pekar ut en person, och inte om hälsa, kropp, tro, politik, pengar eller hur familjen har det.`;

/**
 * Avbrotten ur ett svar. Det som saknar text eller område faller bort: ett
 * avbrott utan ett område det öppnar är just det som inte ska visas.
 */
export function breaksFromReply(reply: unknown, asked: readonly Note[]): Break[] {
  if (typeof reply !== 'object' || reply === null || Array.isArray(reply)) {
    return [];
  }
  const raw = (reply as Record<string, unknown>)['breaks'];
  if (!Array.isArray(raw)) {
    return [];
  }
  const done = new Set(asked.map((note) => note.text.toLowerCase()));
  const kept: Break[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const record = item as Record<string, unknown>;
    const text = typeof record['text'] === 'string' ? record['text'].trim().replace(/[?.!]+$/, '') : '';
    const opens = typeof record['opens'] === 'string' ? record['opens'].trim() : '';
    if (text.length > 0 && text.length <= 120 && opens.length > 0 && !done.has(text.toLowerCase())) {
      done.add(text.toLowerCase());
      kept.push({ text, opens: opens.slice(0, 80) });
    }
  }
  return kept;
}
