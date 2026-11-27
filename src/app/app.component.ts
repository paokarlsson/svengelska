import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { HomeViewComponent } from './home-view/home-view.component';
import { IntroViewComponent } from './intro-view/intro-view.component';
import { MapViewComponent } from './map-view/map-view.component';
import { ProfileStore } from './services/profile-store';
import { Tracker } from './services/tracker';
import { SessionViewComponent } from './session-view/session-view.component';
import { TrainingEngine } from './training/training-engine';
import { WordBlock } from './words/word-catalog';
import { WordLibrary } from './words/word-library';

/** Ytorna. Inget av dem är ett *läge* — se kommentaren nedan. */
type Screen = 'home' | 'session' | 'map' | 'intro';

/**
 * Skalet: vilken yta som visas, och vilken lista den handlar om.
 *
 * Det här är allt skalet gör. Ingen router — appen har en handfull ytor och
 * ingen av dem är värd en adress; ingen tjänst, för valet av lista är inget någon annan
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
  imports: [HomeViewComponent, IntroViewComponent, MapViewComponent, SessionViewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  private readonly engine = inject(TrainingEngine);
  private readonly library = inject(WordLibrary);
  private readonly profiles = inject(ProfileStore);
  private readonly tracker = inject(Tracker);

  /**
   * Den som aldrig öppnat appen möts av startrundan och inte av en lista.
   *
   * Villkoret är *både* ingen profil och inga framsteg. Den som redan övat ska
   * inte ställas inför frågor för att appen fått en ny yta — för hen finns
   * rundan kvar som en knapp på startsidan.
   */
  screen: Screen = !this.profiles.hasProfile && !this.engine.hasPractice ? 'intro' : 'home';
  /** Om startsidan ska öppna med «Ny lista» utfälld — vägen ut ur startrundan. */
  offerList = false;

  constructor() {
    this.tracker.start();
    this.tracker.log('nav', { to: this.screen });
  }
  /** Listan som visas. Vid uppstart den som övades sist, om den finns kvar. */
  block: WordBlock | null = this.library.byId(this.engine.activeBlockId);

  open(block: WordBlock): void {
    this.block = block;
    // Vilken lista nya ord hämtas ur ligger i framstegsdokumentet, så att nästa
    // besök kan peka ut var man var. Det är lagrets sak, inte skalets.
    this.engine.setActiveBlock(block.id);
    this.go('session', block.id);
  }

  showMap(block: WordBlock): void {
    this.block = block;
    this.go('map', block.id);
  }

  showHome(): void {
    this.offerList = false;
    this.go('home');
  }

  showIntro(): void {
    this.go('intro');
  }

  /** Startrundan är klar: nu vet appen nog för att skriva en lista. */
  introDone(): void {
    this.offerList = true;
    this.go('home');
  }

  /** Byter yta. Det enda stället som gör det, så att loggen ser varje byte. */
  private go(screen: Screen, list: string | null = null): void {
    this.tracker.log('nav', { from: this.screen, to: screen, list });
    this.screen = screen;
  }
}
