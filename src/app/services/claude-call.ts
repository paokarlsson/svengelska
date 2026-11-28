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
import { BREAK_INSTRUCTIONS, BREAK_SCHEMA } from '../intro/breaks';
import { FOLLOW_UP_INSTRUCTIONS, FOLLOW_UP_SCHEMA } from '../intro/follow-up';
import { INTRO_INSTRUCTIONS, INTRO_SCHEMA } from '../intro/intro-writing';
import { LIST_INSTRUCTIONS, LIST_SCHEMA } from '../words/generated-list';
import { ListWriteError } from './list-write-error';

/** Modellen som skriver listorna. */
const MODEL = 'claude-opus-5-5';

/** Taket för ett svar. Långt över vad ett svar brukar bli; se `max_tokens` nedan. */
const MAX_TOKENS = 16000;

/** Uppdragen appen har. */
export type TaskName = 'list' | 'followup' | 'intro' | 'break';

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

/** Vad som skiljer ett uppdrag från ett annat: instruktionen, formen och hur länge modellen tänker. */
export interface Task {
  /** Uppdragets namn, för loggen. */
  name: TaskName;
  system: string;
  schema: Record<string, unknown>;
  effort: 'low' | 'medium' | 'high';
}

/** Att skriva en lista. Felsvaren kräver eftertanke. */
export const LIST_TASK: Task = {
  name: 'list',
  system: LIST_INSTRUCTIONS,
  schema: LIST_SCHEMA,
  effort: 'medium',
};

/**
 * Att skriva följdfrågor. Kort svar, och någon väntar på det mitt i ett svep —
 * därför låg ansträngning. Frågorna ska vara lätta att svara på, inte svåra att
 * skriva.
 */
export const FOLLOW_UP_TASK: Task = {
  name: 'followup',
  system: FOLLOW_UP_INSTRUCTIONS,
  schema: FOLLOW_UP_SCHEMA,
  effort: 'low',
};

/**
 * Att skriva startrundans påståenden. Någon sveper medan det skrivs, och de
 * fasta påståendena tar över om det dröjer — därför låg ansträngning.
 */
export const INTRO_TASK: Task = {
  name: 'intro',
  system: INTRO_INSTRUCTIONS,
  schema: INTRO_SCHEMA,
  effort: 'low',
};

/** Att skriva avbrott. Kort svar, skrivet i bakgrunden medan någon övar. */
export const BREAK_TASK: Task = {
  name: 'break',
  system: BREAK_INSTRUCTIONS,
  schema: BREAK_SCHEMA,
  effort: 'low',
};

/** Uppdragen, så att den som anropar kan peka ut ett med namn. */
export const TASKS: Record<TaskName, Task> = {
  list: LIST_TASK,
  followup: FOLLOW_UP_TASK,
  intro: INTRO_TASK,
  break: BREAK_TASK,
};

/**
 * Allt ett anrop bestod av, för loggen: vad som skickades, hur länge det tog,
 * och vad som kom tillbaka — råtexten, inte bara det som gick att tolka. Utan
 * nyckeln, som aldrig står här.
 */
export interface CallRecord {
  model: string;
  effort: Task['effort'];
  max_tokens: number;
  system: string;
  schema: Record<string, unknown>;
  request: string;
  ms: number;
  /** Svaret som det kom, eller `null` om inget kom. */
  reply: {
    id: string;
    model: string;
    stop: string | null;
    usage: unknown;
    text: string;
    /** Allt som inte var text, till exempel tänkande, som typerna det var. */
    other: string[];
  } | null;
  /** Varför det inte blev något, om det inte blev något. */
  error: { reason: string; status: number | null; message: string } | null;
}

/**
 * Ställer frågan och ger tillbaka svaret som det tolkade JSON-värdet.
 *
 * Vad värdet *är* avgörs inte här. Formen hålls av uppdragets schema, men det
 * som kommer tillbaka möts ändå som en inklistrad fil av den som tar emot det.
 */
export async function askClaude(
  client: Anthropic,
  request: string,
  task: Task = LIST_TASK,
  /** Får hela anropet när det är över, lyckat eller inte. */
  observe: (call: CallRecord) => void = () => undefined,
): Promise<unknown> {
  const began = Date.now();
  const call: CallRecord = {
    model: MODEL,
    effort: task.effort,
    max_tokens: MAX_TOKENS,
    system: task.system,
    schema: task.schema,
    request,
    ms: 0,
    reply: null,
    error: null,
  };
  const done = (error: ListWriteError | null, raw: unknown = null): void => {
    call.ms = Date.now() - began;
    if (error !== null) {
      call.error = {
        reason: error.reason,
        status: raw instanceof Anthropic.APIError ? (raw.status ?? null) : null,
        message: raw instanceof Error ? raw.message : error.message,
      };
    }
    observe(call);
  };

  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      // Avböjer modellen av säkerhetsskäl körs samma fråga om på den modell
      // Anthropic pekar ut, i samma anrop. Utan raden stannar ett avböjt
      // önskemål där.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {
        effort: task.effort,
        format: { type: 'json_schema', schema: task.schema },
      },
      system: task.system,
      messages: [{ role: 'user', content: request }],
    });
  } catch (error) {
    const failure = failureFor(error);
    done(failure, error);
    throw failure;
  }

  const text = response.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
  call.reply = {
    id: response.id,
    model: response.model,
    stop: response.stop_reason,
    usage: response.usage,
    text,
    other: response.content.filter((block) => block.type !== 'text').map((block) => block.type),
  };

  if (response.stop_reason === 'refusal') {
    const failure = new ListWriteError('refused');
    done(failure);
    throw failure;
  }
  if (response.stop_reason === 'max_tokens') {
    // Ett avklippt svar är ofullständig JSON. Bättre att säga det än att
    // försöka göra något av en halv.
    const failure = new ListWriteError('unreadable');
    done(failure);
    throw failure;
  }

  try {
    const value: unknown = JSON.parse(text);
    done(null);
    return value;
  } catch {
    const failure = new ListWriteError('unreadable');
    done(failure);
    throw failure;
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
