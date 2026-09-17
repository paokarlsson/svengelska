/**
 * Vilka steg som spelas — den enda filen att röra för att ta tillbaka de tre
 * som göms.
 *
 * Grenen prövar svepet ensamt: sant/falskt, åt båda hållen, mot ett mätt tempo.
 * Match, Återkalla och Skriva är avstängda, inte borttagna, och skillnaden är
 * hela poängen med att spärren bor här.
 *
 * `word-state.ts` är appens sanning om stegen, och dess regler är oförändrat
 * riktiga även när bara ett steg når skärmen. Rivs `STEPS` ned till ett element
 * går domen, den härledda etiketten och varje redan lagrat dokument sönder —
 * och då går grenen inte att kasta bort utan att också kasta bort vägen
 * tillbaka. Därför en spärr och ingen sax.
 *
 * Filen importerar med flit ingenting. Vore `Step` importerad härifrån skulle
 * `word-state.ts` och den här filen peka på varandra, och en cykel mellan
 * reglerna och spärren är precis vad som gör en spärr svår att lyfta. Att
 * strängarna faktiskt *är* steg kontrolleras i stället där `Step` finns, på
 * raden under `ACTIVE_STEPS` i `word-state.ts`.
 */

/**
 * Stegen som når skärmen, i samma ordning som `STEPS`.
 *
 * Att ta tillbaka ett steg är att skriva dess namn här. Att ta tillbaka alla
 * fyra är att skriva alla fyra, och då är appen den den var.
 */
export const ACTIVE_STEPS = ['trueFalse'] as const;
