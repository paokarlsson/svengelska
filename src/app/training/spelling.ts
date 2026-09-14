/**
 * Rättningen av ett skrivet svar.
 *
 * Tre utfall, inte två: `rätt`, `nästan` och `fel`. Den mittersta finns för att
 * betydelsen kan sitta medan stavningen inte gör det, och det är en skillnad
 * `ganger` inte har någon motsvarighet till — där är ett svar rätt eller fel.
 *
 * **Vad «nästan» betyder är avgjort, och det är inte «rätt».** Ett nästan
 * räknas som ett fel i domen: skrivsteget är det enda som mäter stavning, och
 * räknades ett felstavat svar som rätt skulle ett ord kunna nå «automatiserat»
 * utan att någon gång ha stavats rätt — precis den lögn README lovar att appen
 * inte ska berätta.
 *
 * Vad «nästan» ändrar är återkopplingen och tempot: den som skriver `hudn` får
 * se att betydelsen satt och vad som gick fel, och ordet kommer tillbaka i
 * samma pass i stället för att läggas på hög. Att skilja på ett nästan och ett
 * fel i *domen* skulle kräva ett fält till per ord, och det fältet finns det
 * ingen som läser än. Se öppen fråga 2 i docs/plan.md.
 */
import { WordPair, acceptedAnswers, normalize } from '../words/word-catalog';

export type Verdict = 'correct' | 'near' | 'wrong';

/**
 * Så långt ifrån facit ett svar får ligga och ändå räknas som nästan rätt.
 *
 * ANTAGANDE: ett tecken. Två tecken bort ligger andra riktiga ord — `mus` och
 * `mos`, `får` och `får` — och ett «nästan» som pekar på fel ord är sämre än
 * ett rent fel.
 */
export const NEAR_DISTANCE = 1;

/**
 * Kortare svar än så bedöms aldrig som nästan rätt.
 *
 * Ett tecken fel i ett treställigt ord är en tredjedel av ordet, och bland korta
 * ord ligger dessutom grannarna tätt: `ko` och `ku`, `mus` och `mos`. Det är
 * ingen slarvig stavning utan ett annat ord.
 *
 * ANTAGANDE: fyra tecken, satt på känsla. Se docs/plan.md.
 */
export const MIN_NEAR_LENGTH = 4;

/**
 * Domen över ett skrivet svar.
 *
 * Alla godtagna former prövas, och den bästa domen vinner: `att springa` är
 * lika rätt som `springa`, och ett tecken från vilken som helst av dem är
 * nästan rätt.
 */
export function judge(answer: string, pair: WordPair): Verdict {
  const written = normalize(answer);
  if (written.length === 0) {
    return 'wrong';
  }

  let best: Verdict = 'wrong';
  for (const accepted of acceptedAnswers(pair)) {
    if (written === accepted) {
      return 'correct';
    }
    if (accepted.length >= MIN_NEAR_LENGTH && editDistance(written, accepted) <= NEAR_DISTANCE) {
      best = 'near';
    }
  }
  return best;
}

/**
 * Avståndet mellan två ord i tecken: infogning, strykning, utbyte — och
 * ombytta grannar, som räknas som *ett* fel och inte två.
 *
 * Att `hudn` ligger ett steg från `hund` och inte två är hela skälet till att
 * ombytet räknas med: två fingrar i fel ordning är den vanligaste
 * felskrivningen av ett ord man faktiskt kan.
 */
export function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const columns = b.length + 1;
  // Hela rutnätet, inte tre rullande rader: orden är korta nog att det inte
  // spelar någon roll, och en läsbar tabell är värd mer än sparade byte.
  const grid: number[][] = Array.from({ length: rows }, () => new Array<number>(columns).fill(0));

  for (let row = 0; row < rows; row++) {
    grid[row][0] = row;
  }
  for (let column = 0; column < columns; column++) {
    grid[0][column] = column;
  }

  for (let row = 1; row < rows; row++) {
    for (let column = 1; column < columns; column++) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      grid[row][column] = Math.min(
        grid[row - 1][column] + 1,
        grid[row][column - 1] + 1,
        grid[row - 1][column - 1] + cost,
      );
      if (row > 1 && column > 1 && a[row - 1] === b[column - 2] && a[row - 2] === b[column - 1]) {
        grid[row][column] = Math.min(grid[row][column], grid[row - 2][column - 2] + 1);
      }
    }
  }
  return grid[a.length][b.length];
}
