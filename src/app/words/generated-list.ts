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
import { describePersonality } from '../intro/personality';
import { AgeBand, Note, Profile, saysSomething } from '../intro/profile';
import { describeSkill } from '../intro/skill';
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

Du får ett önskemål. Det är antingen ett tema eller en lista eleven redan har. Ibland får du i stället, eller dessutom, veta något om eleven: ungefärlig ålder, vad hen tycker om, om hen övar frivilligt, hur hen vill ha det, och var nivån ligger.

Är det ett tema väljer du ${LIST_SIZE} glosor som hör till det. Säger önskemålet något om ålder eller nivå följer du det; annars går du efter det du vet om eleven, och vet du inget siktar du på mellanstadiet. Välj ord eleven har nytta av och hoppa över dem som stavas likadant på båda språken, för «arm = arm» går inte att öva.

Saknas önskemål väljer du temat själv, ur det eleven tycker om. Välj ett smalt och konkret tema hellre än ett brett: «på stallet» säger mer än «djur», och en lista man känner igen sig i är en lista man övar på. Ta inte ett tema eleven redan har en lista om.

Avbrotten är lösa påståenden appen lagt mellan glosorna, om sådant som inte har med engelska att göra. Vart och ett frågades för att «sant» öppnar ett ordområde, och området står bredvid svaret. «Jag har sett ett norrsken» öppnar vinter och natthimmel, «Jag har lagat något med tejp» verktyg. Ta gärna temat ur ett sådant «sant» när du väljer själv, särskilt om det är oväntat — en lista eleven inte väntat sig är en lista som minns.

Har eleven svarat på följdfrågor väger de tyngst. De är det mest precisa du vet: «sant» på «Jag har tältat på fjället» säger mer om vilka ord eleven har nytta av än «sant» på «Jag gillar natur». Ta temat ur dem när du väljer själv.

Nivån beskrivs med ord eleven klarar och ord hen inte klarar. Den kommer från ett kort prov och har sedan justerats av hur nya listor gått på första försöket, så den är det bästa måttet du har. De flesta glosorna ska ligga i höjd med orden hen inte klarar — ord hen inte kan än men är redo för — och ett par får vara lättare, så att listan inte bara är motstånd. En lista där eleven redan kan nästan allt är ett misslyckande lika mycket som en där hen inte kan något: mät dig mot nivån, inte mot temat. Även ett vardagligt tema har svåra ord. Åldern säger vilken värld orden ska komma ur, inte hur svåra de ska vara: en vuxen nybörjare ska ha lätta ord om vuxna saker, och en van vuxen läsare ska inte få ord en tioåring kan.

Det som sägs om hur eleven vill ha det — motstånd eller medvind, udda ord eller nyttiga — väger in i vilka ord du väljer och hur felsvaren ser ut, men flyttar inte nivån mer än ett litet stycke.

Är det en lista använder du just de glosorna, alla, i den ordning de står. Saknas det ena språket översätter du. Rätta uppenbara stavfel men byt inte ut ord.

En glosa är ett ord eller en kort fras med sin vanligaste översättning, skriven med små bokstäver om det inte är ett egennamn.

Felsvaren är det som avgör om listan är bra. Till varje glosa skriver du tre felsvar på engelska och tre på svenska: ord som eleven rimligen kunde förväxla med det rätta, alltså samma tema, samma ordklass och ungefär samma längd.

Ett felsvar får aldrig vara en annan glosa i listan eller dess översättning. Skälet är att kortet ska mäta om eleven kan ordet som frågas efter. Står «katt» som felsvar till «dog» och «cat = katt» också finns i listan, kan eleven förkasta «dog = katt» genom att känna igen «katt», utan att veta vad «dog» betyder. Hämta därför felsvaren ur temat i stort, utanför listan.

Ett felsvar får inte heller vara en synonym eller en annan godtagbar översättning av glosan, för då är det falska kortet i själva verket sant.

Ge listan ett kort svenskt namn som säger vad den handlar om.`;

/** Vad som följer med önskemålet. Allt utom glosorna är valfritt. */
export interface ListContext {
  /** Glosorna eleven redan har. */
  known: readonly WordPair[];
  /** Vad appen vet om eleven, eller `null` för den som aldrig gjort startrundan. */
  profile?: Profile | null;
  /** Namnen på listorna som redan finns, så att ett tema inte kommer två gånger. */
  lists?: readonly string[];
}

/**
 * Frågan som den skickas.
 *
 * Tre saker kan följa med önskemålet, och var och en nämns bara när den finns:
 * vem eleven är, vilka listor hen har, och vilka glosor hen har. Glosorna nämns
 * som något att undvika *vid eget val*: den som klistrar in veckans läxa ska få
 * just den, även om hälften redan finns.
 *
 * Önskemålet får vara tomt. Då står det uttryckligen att temat är modellens att
 * välja — en tom rad vore en fråga utan fråga.
 */
export function listRequestText(wish: string, context: ListContext): string {
  const asked = wish.trim();
  const parts = [
    asked.length > 0
      ? `Önskemål:\n${asked}`
      : 'Inget önskemål den här gången. Välj temat själv efter det du vet om eleven.',
  ];

  const learner = context.profile ? describeLearner(context.profile) : null;
  if (learner !== null) {
    parts.push(`Om eleven:\n${learner}`);
  }

  const lists = context.lists ?? [];
  if (lists.length > 0) {
    parts.push(`Eleven har redan listor om:\n${lists.join('\n')}`);
  }

  if (context.known.length > 0) {
    const have = context.known.map((pair) => `${pair.en} = ${pair.sv}`).join('\n');
    parts.push(`Eleven har redan de här glosorna. Välj andra när du väljer själv:\n${have}`);
  }
  return parts.join('\n\n');
}

const AGE_TEXT: Record<AgeBand, string> = {
  child: 'Ålder: under 13 år.',
  teen: 'Ålder: 13–17 år.',
  adult: 'Ålder: vuxen.',
};

/**
 * Profilen som modellen får läsa den, eller `null` om den inte säger något.
 *
 * Nivån beskrivs med *orden* och inte med en siffra. «Nivå 3 av 5» betyder
 * något bara för den som sett trappan; «klarade although men inte reluctant»
 * betyder samma sak för alla som kan engelska, och det är en sådan läsare som
 * ska välja nästa ord.
 */
export function describeLearner(profile: Profile): string | null {
  if (!saysSomething(profile)) {
    return null;
  }
  const lines: string[] = [];
  if (profile.age !== null) {
    lines.push(AGE_TEXT[profile.age]);
  }
  if (profile.interests.length > 0) {
    lines.push(`Tycker om: ${profile.interests.join(', ')}.`);
  }
  if (profile.voluntary === true) {
    lines.push('Övar för att hen själv vill.');
  } else if (profile.voluntary === false) {
    lines.push(
      'Övar för att hen måste, inte för att hen vill. Välj ord som är lätta att tycka om.',
    );
  }
  const skill = describeSkill(profile);
  if (skill !== null) {
    lines.push(skill);
  }
  const personality = describePersonality(profile);
  if (personality.length > 0) {
    lines.push('Hur eleven vill ha det:');
    lines.push(...personality.map((line) => `- ${line}`));
  }
  const notes = profile.notes ?? [];
  if (notes.length > 0) {
    lines.push('Svar på följdfrågor:');
    for (const note of notes) {
      lines.push(`- «${note.text}»: ${NOTE_ANSWER[note.answer]}`);
    }
  }
  // Ett «vet ej» på ett avbrott säger ingenting. På en följdfråga säger det
  // att frågan inte träffade, och det står kvar där.
  const breaks = (profile.breaks ?? []).filter((note) => note.answer !== 'unsure');
  if (breaks.length > 0) {
    lines.push('Svar på avbrott — lösa frågor mellan glosorna, och vilket ordområde «sant» öppnar:');
    for (const note of breaks) {
      const opens = note.opens === undefined ? '' : ` (öppnar: ${note.opens})`;
      lines.push(`- «${note.text}»: ${NOTE_ANSWER[note.answer]}${opens}`);
    }
  }
  return lines.join('\n');
}

/** Svaret som eleven gav det. Lagras som yes/no; korten säger sant och falskt. */
const NOTE_ANSWER: Record<Note['answer'], string> = {
  yes: 'sant',
  no: 'falskt',
  unsure: 'hoppade över',
};

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
