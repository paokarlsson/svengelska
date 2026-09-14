/**
 * Ingångsvalet: var veckan börjar.
 *
 * Dum med flit — den känner varken motorn eller blocket, utan får sina fyra
 * alternativ färdigräknade och skickar tillbaka det som trycktes på. Om det
 * här var upplåst eller inte är en mätning, och mätningar hör hemma i motorn.
 *
 * Knappen är `.ui-toggle`, samma som `ganger`:s nivåval. Formen är densamma och
 * betydelsen inte: där ställs en svårighetsgrad in, här öppnas en dörr.
 */
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { EntryOption } from '../training/entry';
import { Step } from '../training/word-state';

/** En ingång som den ser ut på startsidan. */
export interface EntryChoice extends EntryOption {
  locked: boolean;
}

@Component({
  selector: 'app-entry-picker',
  templateUrl: 'entry-picker.component.html',
  styleUrl: 'entry-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EntryPickerComponent {
  @Input({ required: true }) options!: readonly EntryChoice[];
  @Input({ required: true }) selected!: Step;

  @Output() readonly picked = new EventEmitter<Step>();
}
