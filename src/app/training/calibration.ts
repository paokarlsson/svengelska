/**
 * Kalibreringen: de lätta orden som mäter sveptakten.
 *
 * Grenens egentliga idé. Utan den är «snabbt» en kvot mot ett rullande fönster
 * av spelarens egna rätta svar, och det fönstret blandar ihop två saker — *hur
 * fort en tumme kan svepa* och *hur fort just det här ordet kommer*. En trött
 * kväll på en liten telefon flyttar då tröskeln för alla ord på en gång.
 *
 * Fyra kort först i varvet, ett per kanal, med ord som redan sitter. De räknas
 * inte i domen och inte i planen. Vad de ger är ett golv:
 *
 *     golv = tiden det tar att läsa, avgöra och svepa ett ord man redan kan
 *
 * Allt som mäts efter det mäts som kvot mot det golvet, och «kan hen i tempo?»
 * blir ett uttalande som håller: *det här ordet tog dubbelt så lång tid som ett
 * ord du kan*. Det är något annat än *det här ordet tog 2,4 sekunder*, och det
 * är det enda av de två som betyder samma sak i morgon.
 *
 * Att korten också är en uppvärmning är en bonus och inte skälet.
 */
import { Channel } from '../services/progress-store';
import { Random, shuffle } from '../words/shuffle';
import { DirectedWord, WordPair } from '../words/word-catalog';

/**
 * Så många kort kalibreringen är: ett per kanal.
 *
 * Ett per kanal är minimum och sannolikt i underkant — en median av ett enda
 * prov är inget medelvärde, och det rullande fönstret räddar det först efter
 * några varv. Se öppen fråga 3 i docs/nerskalad.md.
 *
 * ANTAGANDE: satt på känsla.
 */
export const CALIBRATION_CARDS = 4;

/**
 * Mätstickan för den som ännu inte har fyra egna behärskade ord.
 *
 * Ligger i koden och inte i `data/glosor.csv`, och det är ett beslut: de här
 * orden är ett *instrument* och ingen läxa. Hamnade de i CSV:n skulle de dyka
 * upp i en vecka, räknas i «ord som sitter» och kunna redigeras bort av någon
 * som städade sin ordlista — och då vore golvet borta utan att någon märkt det.
 *
 * Kravet på ett ord här är att ett barn som kan säga «hund» kan det. Är listan
 * fel är den fel åt det säkra hållet: ett för lätt ord ger ett för lågt golv,
 * och ett för lågt golv gör bedömningen strängare än den behöver vara — aldrig
 * mildare.
 *
 * ANTAGANDE: urvalet är satt på känsla. Se docs/nerskalad.md.
 */
export const EASY_WORDS: readonly WordPair[] = [
  { en: 'dog', sv: 'hund', distractorsEn: ['cat', 'bird'], distractorsSv: ['katt', 'fågel'] },
  { en: 'cat', sv: 'katt', distractorsEn: ['dog', 'fish'], distractorsSv: ['hund', 'fisk'] },
  { en: 'yes', sv: 'ja', distractorsEn: ['no', 'maybe'], distractorsSv: ['nej', 'kanske'] },
  { en: 'no', sv: 'nej', distractorsEn: ['yes', 'maybe'], distractorsSv: ['ja', 'kanske'] },
  { en: 'red', sv: 'röd', distractorsEn: ['blue', 'green'], distractorsSv: ['blå', 'grön'] },
  { en: 'sun', sv: 'sol', distractorsEn: ['moon', 'rain'], distractorsSv: ['måne', 'regn'] },
];

/** Kanalerna i den ordning kalibreringen mäter dem, en gång var. */
export const CALIBRATION_CHANNELS: readonly Channel[] = [
  'en:true',
  'en:false',
  'sv:true',
  'sv:false',
];

/**
 * Ett kalibreringskort: ordet, hållet, och om påståendet ska vara sant.
 *
 * Sanningsvärdet bestäms här och inte av slumpen i `statementFor()`. Ett varv
 * vars fyra prov råkade bli tre sanna och ett falskt mäter tre kanaler och
 * lämnar en omätt, och då är hela uppdelningen i kanaler bortkastad.
 */
export interface CalibrationCard {
  word: DirectedWord;
  channel: Channel;
  truthy: boolean;
}

/**
 * Korten som inleder varvet.
 *
 * Orden tas i första hand ur `known` — spelarens egna behärskade ord, de enda
 * appen *vet* är lätta för just den här spelaren. Finns de inte ännu används
 * mätstickan, och saknas även den blir listan tom: en kalibrering utan lätta
 * ord är ingen kalibrering, och att mäta golvet på ett okänt ord vore att mäta
 * fel sak med rätt precision.
 */
export function calibrationCards(
  known: readonly WordPair[],
  random: Random = Math.random,
): CalibrationCard[] {
  const pool = known.length >= CALIBRATION_CARDS ? known : EASY_WORDS;
  if (pool.length === 0) {
    return [];
  }

  const words = shuffle(pool, random);
  return CALIBRATION_CHANNELS.map((channel, index) => {
    const [direction, truth] = channel.split(':');
    return {
      word: { pair: words[index % words.length], direction: direction as 'en' | 'sv' },
      channel,
      truthy: truth === 'true',
    };
  });
}
