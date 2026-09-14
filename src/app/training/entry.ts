/**
 * Ingångarna: var ett pass kliver in i veckan.
 *
 * Ligger under `training/` och inte i vyn, av två skäl. `requires` är en regel —
 * villkoret för att ett steg ska gå att välja — och en vy ska aldrig räkna ut en
 * tröskel själv. Och `DEFAULT_ENTRY` är en gissning, som därmed hör hemma i
 * tabellen längst ned i docs/plan.md tillsammans med de andra.
 *
 * Skillnaden mot en lägesmeny är hela poängen och lätt att tappa: ett läge
 * gäller passet ut och gör den som övar till sin egen planerare, medan en ingång
 * gäller det *första* kortet och lämnar resten till mätningen. Se «Ingången är
 * användarens, stegen är motorns» i docs/plan.md.
 */
import { Step } from './word-state';

/**
 * Ingången ett pass öppnar i.
 *
 * Svepet, för att det är appens centrum och en app ska öppna i det den är.
 * Match står kvar som den enklare vägen in, inte som början.
 *
 * ANTAGANDE: resonerat, men inte mätt. Se docs/plan.md.
 */
export const DEFAULT_ENTRY: Step = 'recall';

export interface EntryOption {
  step: Step;
  name: string;
  blurb: string;
  /** Steget som minst ett ord måste ha nått. `null` = öppen från början. */
  requires: Step | null;
}

/**
 * Ingångarna som de visas: i stigande svårighet, alltså samma ordning som
 * `STEPS`.
 *
 * Listan läses uppifrån och ned, och då ska den lättaste vägen in stå först.
 * Att i stället låta default stå överst vore att blanda två saker — vilken
 * ingång appen gissar på är `DEFAULT_ENTRY`:s sak, inte radordningens.
 *
 * Att ordningen sammanfaller med `STEPS` gör den inte härledd ur den. `STEPS`
 * är motorns sanning om svårighet; den här listan är en presentation som råkar
 * hålla med, och de får glida isär utan att något går sönder.
 *
 * Skriva är den enda som förtjänas. De tre andra går att ta sig igenom med ett
 * ord man aldrig sett, och ett fel där kostar ingenting — medan ett skrivfält
 * utan förkunskap bara kan svara «fel».
 */
export const ENTRY_OPTIONS: readonly EntryOption[] = [
  { step: 'match', name: 'Match', blurb: 'Para ihop — lite lättare', requires: null },
  { step: 'trueFalse', name: 'Sant/falskt', blurb: 'Stämmer det?', requires: null },
  { step: 'recall', name: 'Svep', blurb: 'Kom ihåg själv', requires: null },
  { step: 'written', name: 'Skriva', blurb: 'Stava ordet', requires: 'written' },
];
