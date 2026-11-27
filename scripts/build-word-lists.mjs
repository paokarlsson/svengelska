/**
 * Gör om `data/glosor.csv` till `src/app/words/word-lists.json`.
 *
 * CSV:n är källan för listorna som följer med bygget: en rad per glosa, en
 * kolumn med listans namn, och felsvaren skrivna för hand. JSON:en är vad appen läser, och den är genererad — rätta i CSV:n och
 * kör `npm run words`, aldrig tvärtom.
 *
 * Skriptet har inga beroenden med flit. Det körs sällan, av en människa, och
 * ett paket till i `package.json` för en halvtimmes arbete är fel pris.
 *
 * Kolumner: Lista;Engelska;Svenska;Felsvar_engelska;Felsvar_svenska
 * Felsvaren är kommaseparerade inuti sin egen kolumn, därav semikolon som
 * fältavgränsare.
 *
 * En sjätte kolumn, `Alternativ_svenska`, är frivillig och blir glosans
 * `also`: former som ska godtas i skrivsteget utan att vara facit. `hunden`
 * för `hund` är inte ett stavfel utan en annan form, och den som skriver den
 * kan betydelsen.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, '..', 'data', 'glosor.csv');
const target = resolve(here, '..', 'src', 'app', 'words', 'word-lists.json');

const COLUMNS = ['Lista', 'Engelska', 'Svenska', 'Felsvar_engelska', 'Felsvar_svenska'];
const OPTIONAL_COLUMNS = ['Alternativ_svenska'];

const rows = readFileSync(source, 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.length > 0)
  .map((line) => line.split(';').map((cell) => cell.trim()));

const [header, ...body] = rows;
const expected = COLUMNS.concat(OPTIONAL_COLUMNS.slice(0, header.length - COLUMNS.length));
if (header.join(';') !== expected.join(';')) {
  throw new Error(`Oväntade kolumner: ${header.join(';')}`);
}

/** `På stallet` → `pa-stallet`. Nyckeln lagras inte i framstegen, men den
 *  pekar ut listan man övade sist och ska tåla att läsas högt. */
function slug(text) {
  return text
    .toLowerCase()
    .replace(/[åä]/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function list(cell) {
  return cell
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

const blocks = [];
const byName = new Map();

for (const [name, en, sv, wrongEn, wrongSv, also] of body) {
  if (!byName.has(name)) {
    const block = { id: slug(name), name, words: [] };
    byName.set(name, block);
    blocks.push(block);
  }
  const word = { en, sv };
  const alsoForms = list(also ?? '');
  if (alsoForms.length > 0) {
    word.also = alsoForms;
  }
  const distractorsEn = list(wrongEn ?? '');
  const distractorsSv = list(wrongSv ?? '');
  if (distractorsEn.length > 0) {
    word.distractorsEn = distractorsEn;
  }
  if (distractorsSv.length > 0) {
    word.distractorsSv = distractorsSv;
  }
  byName.get(name).words.push(word);
}

// Två rader som är samma glosa vore två sanningar om samma framsteg. Bättre
// att det märks här än i appen.
const seen = new Map();
for (const block of blocks) {
  for (const word of block.words) {
    const key = `en:${word.en.toLowerCase()}=${word.sv.toLowerCase()}`;
    if (seen.has(key) && seen.get(key) === block.id) {
      throw new Error(`Glosan ${key} står två gånger i ${block.id}`);
    }
    seen.set(key, block.id);
  }
}

writeFileSync(target, `${JSON.stringify(blocks, null, 2)}\n`, 'utf8');
console.log(`${blocks.length} block, ${seen.size} glosor → ${target}`);
