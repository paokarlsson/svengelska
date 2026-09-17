import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { HomeViewComponent } from './home-view/home-view.component';
import { MapViewComponent } from './map-view/map-view.component';
import { SessionViewComponent } from './session-view/session-view.component';
import { TrainingEngine } from './training/training-engine';
import { WordBlock, blockById } from './words/word-catalog';

/** De tre ytorna. Inget av dem är ett *läge* — se kommentaren nedan. */
type Screen = 'home' | 'session' | 'map';

/**
 * Skalet: vilken av tre ytor som visas, och vilken lista de handlar om.
 *
 * Det här är allt skalet gör. Ingen router — appen har tre ytor och ingen av
 * dem är värd en adress; ingen tjänst, för valet av lista är inget någon annan
 * behöver veta om.
 *
 * Notera vad som *inte* finns: en lägesväljare, och sedan grenen inte heller en
 * ingångsväljare. Startsidan väljer var nya ord hämtas ifrån; vilka ord ett
 * varv innehåller är repetitionsplanens sak, och vilket steg de övas i finns
 * det bara ett av.
 */
@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrl: 'app.component.scss',
  imports: [HomeViewComponent, MapViewComponent, SessionViewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  private readonly engine = inject(TrainingEngine);

  screen: Screen = 'home';
  /** Listan som visas. Vid uppstart den som övades sist, om den finns kvar. */
  block: WordBlock | null = blockById(this.engine.activeBlockId);

  open(block: WordBlock): void {
    this.block = block;
    // Vilken lista nya ord hämtas ur ligger i framstegsdokumentet, så att nästa
    // besök kan peka ut var man var. Det är lagrets sak, inte skalets.
    this.engine.setActiveBlock(block.id);
    this.screen = 'session';
  }

  showMap(block: WordBlock): void {
    this.block = block;
    this.screen = 'map';
  }

  showHome(): void {
    this.screen = 'home';
  }
}
