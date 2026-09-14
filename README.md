# Svengelska

Glosträning som för ett block om tjugo engelska ord genom fyra successivt mer
krävande steg, där varje ord rör sig i sin egen takt.

    Match → Sant/falskt → Återkalla → Skriva

Varje steg tar bort ett stöd. Match parar ihop ord och översättning bland flera
alternativ. Sant/falskt visar ett påstående — `dog = hund` — att svepa rätt
eller fel. Återkalla visar bara ordet, låter den som övar tänka fram
översättningen, visar facit och frågar om det stämde. Skriva kräver fri
produktion, och verifierar då inte bara betydelsen utan också stavningen.

Rörelsen är `igenkänning med stöd → igenkänning → aktiv återkallning → fri
produktion`, och den som övar behöver inte veta något om den. Det finns ingen
nivåväljare och ingen lägesmeny: vilket steg ett ord visas i är något systemet
avgör av hur ordet presterat, ord för ord.

**Det här repot är ett skelett.** Kärnan — lagret, härledningen av vad ett ord
kan, och motorn mellan dem — finns och är testad. De fyra vyerna finns inte än.
Vad som är gjort, vad som är avgjort och vad som är en gissning står i
[`docs/plan.md`](docs/plan.md).

## Vad som finns

| Path | Vad det är |
| --- | --- |
| `src/app/words/word-catalog.ts` | Vad en glosa är, hur den identifieras, och startblocket |
| `src/app/training/word-state.ts` | De fyra stegen, och de rena reglerna för vad ett ord kan |
| `src/app/training/training-engine.ts` | Vad appen tror om den som övar, och vad den gör med det |
| `src/app/services/progress-store.ts` | Det lagrade dokumentet, dess version och dess normalisering |
| `src/app/app.component.*` | Skalet, tills sessionsdirigenten finns |
| `src/styles/` | Delad stilmall: `_tokens.scss`, `_base.scss`, `_ui.scss` |
| `docs/plan.md` | Vad som är avgjort, vad som är öppet, och vilka konstanter som är gissningar |

`match-view/`, `swipe-view/` och `write-view/` är tomma och väntar på steg 4 i
planen.

## Tre lager

Appen är delad så att pedagogiken inte sprids ut över händelsehanterare:

| Lager | Vad det avgör |
| --- | --- |
| Vyerna | Vad som står på skärmen |
| `TrainingEngine` | Vad den som övar kan, och vad som bör komma härnäst |
| `ProgressRepository` | Var byten ligger |

En vy frågar motorn — *vilket steg ska det här ordet övas i*, *var det svaret
snabbt*, *hur mycket behöver ordet nötas* — och läser aldrig en tröskel för att
räkna ut det själv. Motorn äger i sin tur inga rena regler; de ligger i
`word-state.ts`, där varje funktion har formen

    gammalt tillstånd + ny händelse = nytt tillstånd

och därför går att pröva utan en spelare.

## Vad som sparas, och varför just det

Ett ord har ingen samlad poäng. Det har ett mått **per steg**, eftersom det är
det som säger något om vad som bör komma härnäst:

    dog → hund
    match:        sitter
    true_false:   sitter
    recall:       övar
    written:      svag

Tre beslut i den formen är värda att känna till innan man ändrar i den:

**Tillståndet lagras inte, det härleds.** Det finns inget fält som säger att
ordet är i `RECALL`. Etiketten räknas fram ur måtten vid visning — sparades båda
skulle de kunna glida isär, och då är frågan vilken som är sann. Det är också
vad som gör tillbakagång gratis: ett ord som tappar greppet hamnar i sitt
tidigare steg av sig självt, utan att någon skrivit en nedflyttning.

**Farten lagras som kvot mot stegets egen baslinje, aldrig som sekunder.** Ett
svep, ett återkallat svar och ett skrivet svar ligger på tre olika tidsskalor.
En kvot på 1,0 betyder «lika snabb som du brukar vara i det här steget», och
betyder samma sak i alla fyra. Baslinjen mäts bara på rätta svar: ett fel är
ofta ett långt grubbel, och att låta det höja baslinjen vore att låta tröskeln
sjunka varje gång det går dåligt.

**Igenkänning kan aldrig ensam nå «automatiserat».** Match och sant/falskt mäter
att kopplingen känns igen, inte att den går att plocka fram. Ett ord räknas som
automatiserat först när det skrivna steget sitter, och det ligger som en regel i
koden och inte som en förhoppning — annars går det att matcha sig till en grön
karta utan att kunna producera ett enda ord.

Domen i ett steg vilar på de fem senaste svaren: fyra rätt för att bli
behärskad, två missar i samma fönster för att sluta vara det. Att trösklarna
skiljer sig uppåt och nedåt är vad som gör att etiketten inte blinkar över
gränsen, och det kostar inget extra lagrat tillstånd.

Allt ligger i `localStorage` under en nyckel, `svengelska-progress`, och
`services/progress-store.ts` är den enda filen som vet det. Dokumentet bär ett
`schemaVersion`, så nästa ändring av formen har någonstans att hänga sin
migrering.

## Släktskapet med ganger

Appen är byggd på [`ganger`](https://github.com/paokarlsson/ganger), som tränar
multiplikationstabellen med samma pedagogiska rörelse. Designsystemet, riggen
och lagringsmönstret är lyfta därifrån; svårighetshärledningen, nivåapparaten
och de aritmetiska distraktorerna är det inte, eftersom de hämtar sina svar ur
tabellens struktur och ord inte har någon.

Den skillnaden är värd en rad för sig: i `ganger` *är* 7 × 8 svårare än 2 × 3 av
skäl som går att räkna ut, medan att `beautiful` är svårare än `cat` är en
mätning. Därför bär en glosa ingen svårighetsgrad — svårigheten är något
systemet observerar, per ord och per steg.

Hela avvägningen står under «Arvet från ganger» i [`docs/plan.md`](docs/plan.md).

## Utveckling

Bygget kräver Node 22.22.3 eller senare (24 LTS är vad CI och
[compose.yml](compose.yml) använder).

    npm ci
    npm start    # dev-server på http://localhost:4200/
    npm test     # Vitest i jsdom
    npm run build

För maskiner utan node kör `docker compose up` dev-servern i en container och
exponerar den på [http://localhost:4200](http://localhost:4200).

## Driftsättning

`.github/workflows/pages.yml` bygger varje push till `main` med
`--base-href /svengelska/` och publicerar `dist/browser` till GitHub Pages.
Inget committas till repot; Pages-källan måste vara satt till *GitHub Actions*
under Settings → Pages.
