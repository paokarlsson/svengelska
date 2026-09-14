/**
 * Ingångsvalet: var veckan börjar.
 *
 * Dum med flit — den känner varken motorn eller blocket, utan får sina fyra
 * alternativ färdigräknade och skickar tillbaka det som trycktes på. Om det
 * här var upplåst eller inte är en mätning, och mätningar hör hemma i motorn.
 *
 * Ett tryck *startar* veckan; det finns inget valt läge att visa och därför
 * heller inget `selected`. Knappen är `.ui-toggle` för formens skull, men bär
 * varken `is-active` eller `aria-pressed`: den ställer inte in något, den
 * öppnar en dörr.
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

  @Output() readonly picked = new EventEmitter<Step>();
}
