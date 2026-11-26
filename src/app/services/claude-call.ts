/**
 * Anropet till Claude, och vad som kan gå fel med det.
 *
 * Den enda filen som importerar Anthropics SDK, och den laddas först när någon
 * ber om en lista — se `list-writer.ts`. SDK:n är större än resten av appen
 * tillsammans, och den som bara övar ska inte hämta den.
 *
 * Anropet går direkt från webbläsaren, eftersom appen inte har någon server.
 * Det är vad `dangerouslyAllowBrowser` säger ja till, och namnet är befogat i
 * det allmänna fallet: en nyckel som bakas in i en webbsida kan läsas av alla
 * som öppnar den. Här är nyckeln användarens egen, inklistrad i den egna
 * webbläsaren, och når aldrig någon annan än Anthropic.
 */
import Anthropic from '@anthropic-ai/sdk';
import { LIST_INSTRUCTIONS, LIST_SCHEMA } from '../words/generated-list';
import { ListWriteError } from './list-write-error';

/** Modellen som skriver listorna. */
const MODEL = 'claude-opus-5-5';

/**
 * Hur länge ett anrop får ta, i millisekunder.
 *
 * En lista är ett kort svar, men modellen tänker först. Två minuter är långt
 * över vad det brukar ta och kort nog för att den som väntar ska få ett besked.
 */
const TIMEOUT_MS = 120_000;

/** Klienten för en nyckel. */
export function connect(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, timeout: TIMEOUT_MS });
}

/**
 * Ställer frågan och ger tillbaka svaret som det tolkade JSON-värdet.
 *
 * Vad värdet *är* avgörs inte här. Formen hålls av `LIST_SCHEMA`, men det som
 * kommer tillbaka möts ändå som en inklistrad fil av `blockFromReply()`.
 */
export async function askClaude(client: Anthropic, request: string): Promise<unknown> {
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // Avböjer modellen av säkerhetsskäl körs samma fråga om på den modell
      // Anthropic pekar ut, i samma anrop. Utan raden stannar ett avböjt
      // önskemål där.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: LIST_SCHEMA },
      },
      system: LIST_INSTRUCTIONS,
      messages: [{ role: 'user', content: request }],
    });
  } catch (error) {
    throw failureFor(error);
  }

  if (response.stop_reason === 'refusal') {
    throw new ListWriteError('refused');
  }
  if (response.stop_reason === 'max_tokens') {
    // Ett avklippt svar är ofullständig JSON. Bättre att säga det än att
    // försöka göra en lista av en halv.
    throw new ListWriteError('unreadable');
  }

  const text = response.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
  try {
    return JSON.parse(text);
  } catch {
    throw new ListWriteError('unreadable');
  }
}

/** Vad ett fel från anropet betyder för den som väntar. Mest specifikt först. */
function failureFor(error: unknown): ListWriteError {
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return new ListWriteError('bad-key');
  }
  if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError) {
    return new ListWriteError('busy');
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new ListWriteError('offline');
  }
  if (error instanceof Anthropic.APIError) {
    return new ListWriteError('failed', error.message);
  }
  return new ListWriteError('failed');
}
