import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { CallRecord, LIST_TASK, askClaude } from './claude-call';
import { ListWriteError, WriteFailure } from './list-write-error';
import { LIST_INSTRUCTIONS, LIST_SCHEMA } from '../words/generated-list';

/** En klient som svarar med `reply`, eller kastar det om det är ett fel. */
function clientThat(reply: unknown, sent: Record<string, unknown>[] = []): Anthropic {
  return {
    beta: {
      messages: {
        create: async (params: Record<string, unknown>) => {
          sent.push(params);
          if (reply instanceof Error) {
            throw reply;
          }
          return reply;
        },
      },
    },
  } as unknown as Anthropic;
}

function message(text: string, stop_reason = 'end_turn'): unknown {
  return { content: [{ type: 'thinking', thinking: '' }, { type: 'text', text }], stop_reason };
}

function apiError(status: number, text = 'fel'): Error {
  return Anthropic.APIError.generate(
    status,
    { type: 'error', error: { type: 'x', message: text } },
    text,
    new Headers(),
  );
}

async function failure(reply: unknown): Promise<ListWriteError> {
  try {
    await askClaude(clientThat(reply), 'rymden');
  } catch (error) {
    expect(error).toBeInstanceOf(ListWriteError);
    return error as ListWriteError;
  }
  throw new Error('fick ett svar fast det skulle gå fel');
}

describe('askClaude', () => {
  describe('vad den lämnar till loggen', () => {
    const observed = async (reply: unknown): Promise<CallRecord> => {
      const calls: CallRecord[] = [];
      await askClaude(clientThat(reply), 'rymden', LIST_TASK, (call) => calls.push(call)).catch(() => undefined);
      expect(calls).toHaveLength(1);
      return calls[0];
    };

    it('lämnar frågan, instruktionen, schemat och råsvaret', async () => {
      const call = await observed({ ...(message('{"name":"Rymden"}') as object), id: 'msg_1', model: 'm', usage: { output_tokens: 7 } });
      expect(call.request).toBe('rymden');
      expect(call.system).toBe(LIST_INSTRUCTIONS);
      expect(call.schema).toBe(LIST_SCHEMA);
      expect(call.reply).toMatchObject({ id: 'msg_1', stop: 'end_turn', text: '{"name":"Rymden"}', usage: { output_tokens: 7 }, other: ['thinking'] });
      expect(call.error).toBeNull();
      expect(call.ms).toBeGreaterThanOrEqual(0);
    });

    // Det som inte gick att tolka är just det som behöver gå att läsa i efterhand.
    it('lämnar råsvaret även när det inte gick att tolka', async () => {
      const call = await observed(message('inte json'));
      expect(call.reply?.text).toBe('inte json');
      expect(call.error?.reason).toBe('unreadable');
    });

    it('lämnar felet när inget svar kom', async () => {
      const call = await observed(apiError(429, 'för många'));
      expect(call.reply).toBeNull();
      expect(call.error).toMatchObject({ reason: 'busy', status: 429 });
    });
  });

  it('ger tillbaka svaret tolkat, förbi tankeblocken', async () => {
    const reply = await askClaude(clientThat(message('{"name":"Rymden","words":[]}')), 'rymden');
    expect(reply).toEqual({ name: 'Rymden', words: [] });
  });

  it('skickar uppdraget, formen och frågan', async () => {
    const sent: Record<string, unknown>[] = [];
    await askClaude(clientThat(message('{}'), sent), 'på restaurang');

    expect(sent).toHaveLength(1);
    expect(sent[0]['system']).toBe(LIST_INSTRUCTIONS);
    expect(sent[0]['messages']).toEqual([{ role: 'user', content: 'på restaurang' }]);
    expect(sent[0]['output_config']).toMatchObject({
      format: { type: 'json_schema', schema: LIST_SCHEMA },
    });
  });

  it('säger ifrån när svaret inte är JSON', async () => {
    expect((await failure(message('inte json'))).reason).toBe('unreadable');
  });

  // Ett avklippt svar är en halv lista, och en halv lista är ingen lista.
  it('gör aldrig en lista av ett avklippt svar', async () => {
    const cut = message('{"name":"Rymden","words":[]}', 'max_tokens');
    expect((await failure(cut)).reason).toBe('unreadable');
  });

  it('skiljer ett avböjt önskemål från ett trasigt svar', async () => {
    expect((await failure(message('', 'refusal'))).reason).toBe('refused');
  });

  it('översätter varje sorts fel till något den som väntar kan göra något åt', async () => {
    const cases: [Error, WriteFailure][] = [
      [apiError(401), 'bad-key'],
      [apiError(403), 'bad-key'],
      [apiError(429), 'busy'],
      [apiError(529), 'busy'],
      [new Anthropic.APIConnectionError({ message: 'nätet' }), 'offline'],
      [apiError(400), 'failed'],
      [new Error('något annat'), 'failed'],
    ];

    for (const [error, reason] of cases) {
      expect((await failure(error)).reason).toBe(reason);
    }
  });

  it('för vidare Anthropics eget besked när det finns ett', async () => {
    const error = await failure(apiError(400, 'Your credit balance is too low'));
    expect(error.detail).toContain('credit balance');
  });
});
