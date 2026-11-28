/**
 * Varje anrop till Claude, och loggen av det.
 *
 * Alla som skriver något med Claude — listor, startrundans påståenden,
 * följdfrågor, avbrott — går härigenom. Det är för loggens skull: varje anrop
 * loggas i sin helhet, som två händelser.
 *
 * - `ai.ask` när det går iväg: uppdraget, modellen, ansträngningen, hela
 *   instruktionen, schemat och frågan.
 * - `ai.got` när det är över: tiden, råsvaret som det kom, token-användningen
 *   och hur det slutade — eller varför det inte blev något.
 *
 * Det är mycket text, och det är avsikten. Den som vill förstå varför någon
 * fick en lista om mjöl och deg behöver se exakt vad modellen fick veta och
 * exakt vad den svarade, inte en sammanfattning av det. Nyckeln står aldrig i
 * någon av dem.
 *
 * SDK:n laddas först här, och bara när ett anrop görs — se `claude-call.ts`.
 */
import { Injectable, inject } from '@angular/core';
import type { CallRecord, TaskName } from './claude-call';
import { Tracker } from './tracker';

@Injectable({ providedIn: 'root' })
export class Ai {
  private readonly tracker = inject(Tracker);
  private calls = 0;

  /** Ställer frågan till uppdraget `task` och ger det tolkade svaret. */
  async ask(apiKey: string, request: string, task: TaskName): Promise<unknown> {
    const { TASKS, askClaude, connect } = await import('./claude-call');
    const chosen = TASKS[task];
    // Ett nummer per anrop, så att frågan och svaret går att para ihop i en
    // logg där flera anrop pågår samtidigt.
    const call = `${Date.now().toString(36)}-${++this.calls}`;
    this.tracker.log('ai.ask', {
      call,
      task,
      effort: chosen.effort,
      system: chosen.system,
      schema: chosen.schema,
      request,
    });
    return askClaude(connect(apiKey), request, chosen, (record: CallRecord) => {
      this.tracker.log('ai.got', {
        call,
        task,
        model: record.model,
        ms: record.ms,
        reply: record.reply,
        error: record.error,
      });
    });
  }
}
