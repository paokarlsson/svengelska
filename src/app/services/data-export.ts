/**
 * Allt appen vet, som en text att kopiera.
 *
 * Till för analys: den som övat klistrar in texten någon annanstans — hos den
 * som hjälper till att bygga appen, till exempel — och frågorna som inte går
 * att avgöra vid ett skrivbord går då att ställa till riktiga svar. Ligger
 * golvet för `sv:true` på samma ställe som för `en:true`? Hur stor andel av
 * svaren är «vet ej»? Det står i `docs/` att sådant ska avgöras av att titta
 * på ett barn i några veckor, och det här är fönstret att titta genom.
 *
 * Tre saker är bestämda av det syftet:
 *
 * **Nyckeln följer aldrig med.** Exporten byggs ur framstegen, profilen och
 * listorna. Nyckeln ligger för sig och rörs inte av den här filen — den har
 * ingen väg hit, och ett test håller det så.
 *
 * **Bara det som mätts.** Ett ord som aldrig setts har ingenting att säga, och
 * de tre avstängda stegen har inga mätningar alls. Utan dem är texten en
 * bråkdel så lång, och det spelar roll när den ska klistras in för hand.
 *
 * **Tätt och inte vackert.** Ingen indragning: texten ska läsas av en maskin,
 * och varje blanksteg är ett tecken till att kopiera.
 */
import { Profile } from '../intro/profile';
import { StepStat } from '../training/word-state';
import { WordBlock } from '../words/word-catalog';
import { Channel, ProgressDocument, Settings } from './progress-store';

/** Höjs när formen ändras, så att den som läser vet vad den läser. */
export const EXPORT_VERSION = 1;

/** En lista som den står i exporten. Felsvaren följer med: de är instrumentet. */
interface ExportedList {
  id: string;
  name: string;
  /** Om appen skrev listan, till skillnad från dem som kom med bygget. */
  own: boolean;
  words: WordBlock['words'];
}

export interface DataExport {
  app: 'svengelska';
  exportVersion: number;
  /** När exporten gjordes, i klartext och i millisekunder som resten. */
  exportedAt: string;
  exportedAtMs: number;
  settings: Settings;
  bestStreak: number;
  /** Kalibreringsproven per kanal, i sekunder. Medianen är kanalens golv. */
  baselines: Record<Channel, number[]>;
  activeListId: string | null;
  profile: Profile | null;
  lists: ExportedList[];
  /**
   * Mätningarna i svepsteget, per håll: `en:dog=hund` och `sv:hund=dog`.
   * Tidpunkterna är millisekunder; `paces` är kvoter mot kanalens golv.
   */
  words: Record<string, StepStat>;
}

export interface ExportSources {
  document: ProgressDocument;
  profile: Profile | null;
  blocks: readonly WordBlock[];
  /** Om en lista kommit till i appen. */
  isOwn: (id: string) => boolean;
  now: number;
}

export function buildExport(sources: ExportSources): DataExport {
  const { document, profile, blocks, isOwn, now } = sources;

  const words: Record<string, StepStat> = {};
  for (const [key, record] of Object.entries(document.words)) {
    if (record.trueFalse.attempts > 0) {
      words[key] = record.trueFalse;
    }
  }

  return {
    app: 'svengelska',
    exportVersion: EXPORT_VERSION,
    exportedAt: new Date(now).toISOString(),
    exportedAtMs: now,
    settings: document.settings,
    bestStreak: document.bestStreak,
    baselines: document.baselines,
    activeListId: document.activeBlockId,
    profile,
    lists: blocks.map((block) => ({
      id: block.id,
      name: block.name,
      own: isOwn(block.id),
      words: block.words,
    })),
    words,
  };
}

/** Exporten som texten som kopieras. */
export function exportText(sources: ExportSources): string {
  return JSON.stringify(buildExport(sources));
}
