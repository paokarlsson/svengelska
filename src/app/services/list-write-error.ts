/**
 * Varför det inte blev någon lista.
 *
 * En egen fil för att både `list-writer.ts` och `claude-call.ts` behöver den,
 * och den senare laddas för sig: låg felet i någon av dem skulle den andra dra
 * in den, och då vore uppdelningen borta.
 */

/** Skälen, som vyn gör ord av. */
export type WriteFailure =
  | 'no-key'
  | 'bad-key'
  | 'busy'
  | 'offline'
  | 'refused'
  | 'unreadable'
  | 'failed';

export class ListWriteError extends Error {
  constructor(
    readonly reason: WriteFailure,
    /** Vad Anthropic svarade, när det finns något att visa. */
    readonly detail: string | null = null,
  ) {
    super(detail ?? reason);
    this.name = 'ListWriteError';
  }
}
