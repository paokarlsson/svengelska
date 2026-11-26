/**
 * En lista som appen skriver själv: vad som frågas efter, och vad som godtas.
 *
 * Allt här är rent — ingen nyckel, inget nät. Anropet ligger i
 * `services/list-writer.ts`; det här är de två halvor av det som går att pröva
 * utan en modell: vad som skickas, och vad som görs av det som kommer tillbaka.
 *
 * Den andra halvan är den viktiga. En skriven lista är text från en modell, och
 * den ska mötas med samma hållning som en inklistrad fil: det som går att känna
 * igen behålls och resten faller bort. Ovanpå det ligger en regel som inte får
 * hänga på att modellen lydde — se `withoutLeaks()`.
 */
import { WordBlock, WordPair, normalize, parseBlocks } from './word-catalog';

/**
 * Så många glosor en lista får när önskemålet är ett tema.
 *
 * Samma tal som ett varv, och det är avsikten: en ny lista ska gå att se hela
 * vägen igenom på ett varv när dagens budget tillåter det.
 */
export const LIST_SIZE = 10;

/** Formen svaret måste ha. Modellen hålls till den av API:t, inte av en bön. */
export const LIST_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Listans namn: två till fyra ord, på svenska.' },
    words: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          en: { type: 'string', description: 'Glosan på engelska.' },
          sv: { type: 'string', description: 'Glosan på svenska.' },
          distractorsEn: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tre engelska felsvar. Inget av dem står som glosa i listan.',
          },
          distractorsSv: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tre svenska felsvar. Inget av dem står som glosa i listan.',
          },
        },
        required: ['en', 'sv', 'distractorsEn', 'distractorsSv'],
        additionalProperties: false,
      },
    },
  },
  required: ['name', 'words'],
  additionalProperties: false,
} as const;

/**
 * Uppdraget.
 *
 * Skrivet som en förklaring och inte som en regellista: modellen får veta vad
 * ett kort mäter, och varför ett felsvar ur den egna listan förstör mätningen.
 * Den som förstår skälet väljer rätt även i de fall ingen regel täcker.
 */
export const LIST_INSTRUCTIONS = `Du skriver glosor till en app där en svensk elev övar engelska.

Appen visar ett kort i taget med ett påstående, till exempel «dog = hund», och eleven svarar sant, falskt eller vet ej. Varje glosa övas åt båda hållen: ibland är engelskan frågan, ibland svenskan. Hälften av korten är falska, och då står ett av dina felsvar i stället för den rätta översättningen.

Du får ett önskemål. Det är antingen ett tema eller en lista eleven redan har.

Är det ett tema väljer du ${LIST_SIZE} glosor som hör till det. Säger önskemålet något om ålder eller nivå följer du det; annars siktar du på mellanstadiet. Välj ord eleven har nytta av och hoppa över dem som stavas likadant på båda språken, för «arm = arm» går inte att öva.

Är det en lista använder du just de glosorna, alla, i den ordning de står. Saknas det ena språket översätter du. Rätta uppenbara stavfel men byt inte ut ord.

En glosa är ett ord eller en kort fras med sin vanligaste översättning, skriven med små bokstäver om det inte är ett egennamn.

Felsvaren är det som avgör om listan är bra. Till varje glosa skriver du tre felsvar på engelska och tre på svenska: ord som eleven rimligen kunde förväxla med det rätta, alltså samma tema, samma ordklass och ungefär samma längd.

Ett felsvar får aldrig vara en annan glosa i listan eller dess översättning. Skälet är att kortet ska mäta om eleven kan ordet som frågas efter. Står «katt» som felsvar till «dog» och «cat = katt» också finns i listan, kan eleven förkasta «dog = katt» genom att känna igen «katt», utan att veta vad «dog» betyder. Hämta därför felsvaren ur temat i stort, utanför listan.

Ett felsvar får inte heller vara en synonym eller en annan godtagbar översättning av glosan, för då är det falska kortet i själva verket sant.

Ge listan ett kort svenskt namn som säger vad den handlar om.`;

/**
 * Önskemålet som det skickas.
 *
 * Glosorna eleven redan har följer med, så att ett tema inte ger samma ord en
 * gång till. De nämns som något att undvika *vid eget val*: den som klistrar in
 * veckans läxa ska få just den, även om hälften redan finns.
 */
export function listRequestText(wish: string, known: readonly WordPair[]): string {
  const request = `Önskemål:\n${wish.trim()}`;
  if (known.length === 0) {
    return request;
  }
  const have = known.map((pair) => `${pair.en} = ${pair.sv}`).join('\n');
  return `${request}\n\nEleven har redan de här glosorna. Välj andra när du väljer själv:\n${have}`;
}

/**
 * Listan ur ett svar, eller `null` om svaret inte gick att göra en lista av.
 *
 * `taken` är de id:n som redan finns. En ny lista får aldrig skriva över en
 * gammal för att två teman råkade få samma namn.
 */
export function blockFromReply(reply: unknown, taken: ReadonlySet<string>): WordBlock | null {
  if (typeof reply !== 'object' || reply === null || Array.isArray(reply)) {
    return null;
  }
  const raw = reply as Record<string, unknown>;
  const name = typeof raw['name'] === 'string' ? raw['name'].trim() : '';
  const label = name.length > 0 ? name : 'Egen lista';

  const [block] = parseBlocks([{ id: freeId(label, taken), name: label, words: raw['words'] }]);
  return block === undefined ? null : withoutLeaks(block);
}

/**
 * Tar bort felsvar som läcker.
 *
 * Två sorter, och ingen av dem får hänga på att modellen följde uppdraget:
 *
 * **Felsvar som står i listan.** Det är läckan `README` kallar innehållets
 * viktigaste beslut: ett felsvar som eleven känner igen från en annan glosa går
 * att förkasta utan att kunna ordet som frågas efter. Uppdraget ber modellen
 * låta bli; den här funktionen ser till att det håller.
 *
 * **Felsvar som är rätt.** Ett felsvar som är glosans egen översättning gör det
 * falska kortet sant.
 *
 * Blir en glosa utan felsvar åt något håll faller `distractors.ts` tillbaka på
 * blocket, precis som för en lista med bara två kolumner.
 */
export function withoutLeaks(block: WordBlock): WordBlock {
  const english = new Set(block.words.map((pair) => normalize(pair.en)));
  const swedish = new Set(block.words.map((pair) => normalize(pair.sv)));

  const words = block.words.map((pair): WordPair => {
    const cleaned: WordPair = { en: pair.en, sv: pair.sv };
    const distractorsEn = clean(pair.distractorsEn, english);
    const distractorsSv = clean(pair.distractorsSv, swedish);
    if (pair.also !== undefined) {
      cleaned.also = pair.also;
    }
    if (distractorsEn.length > 0) {
      cleaned.distractorsEn = distractorsEn;
    }
    if (distractorsSv.length > 0) {
      cleaned.distractorsSv = distractorsSv;
    }
    return cleaned;
  });
  return { ...block, words };
}

/** Felsvaren utan dem som står i `listed`, en gång var. */
function clean(distractors: readonly string[] | undefined, listed: ReadonlySet<string>): string[] {
  const kept: string[] = [];
  const seen = new Set<string>();
  for (const word of distractors ?? []) {
    const form = normalize(word);
    if (!listed.has(form) && !seen.has(form)) {
      seen.add(form);
      kept.push(word);
    }
  }
  return kept;
}

/** Ett ledigt id för listan: `egen-rymden`, och `egen-rymden-2` om det är taget. */
function freeId(name: string, taken: ReadonlySet<string>): string {
  const base = `egen-${slug(name) || 'lista'}`;
  if (!taken.has(base)) {
    return base;
  }
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
}

/** Samma form som `scripts/build-word-lists.mjs` ger veckornas id:n. */
function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[åä]/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
