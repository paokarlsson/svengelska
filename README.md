# Svengelska

Glosträning som för veckans glosor genom fyra successivt mer krävande steg,
där varje ord rör sig i sin egen takt.

    Match → Sant/falskt → Återkalla → Skriva

Varje steg tar bort ett stöd. Match parar ihop ord och översättning bland flera
alternativ. Sant/falskt visar ett påstående — `dog = hund` — att svepa rätt
eller fel. Återkalla visar bara ordet, låter den som övar tänka fram
översättningen, visar facit och frågar om det stämde. Skriva kräver fri
produktion, och verifierar då inte bara betydelsen utan också stavningen.

Rörelsen är `igenkänning med stöd → igenkänning → aktiv återkallning → fri
produktion`, och den som övar behöver inte veta något om den. Det finns ingen
nivåväljare och ingen lägesmeny: vilket steg ett ord visas i är något systemet
avgör av hur ordet presterat, ord för ord. Det enda som väljs är *vilka* ord —
vilken vecka — och det valet vet en människa bättre än en mätning.

Blocket är stabilt genom hela passet, men varje ord rör sig i sin egen takt:
sju ord kan ha lämnat Match medan tre är kvar, och för den som övar är det
fortfarande en och samma lista.

Appen går att öva i: välj veckans lista på startsidan, tryck igång, och svara
tills passet är slut. Vad som är avgjort, vad som fortfarande är öppet och
vilka konstanter som är gissningar står i [`docs/plan.md`](docs/plan.md).

## Vad som finns

| Path | Vad det är |
| --- | --- |
| `data/glosor.csv` | Ordlistorna som de skrivs — en rad per glosa, en kolumn per vecka |
| `src/app/words/word-lists.json` | Samma listor som appen läser dem. Genererad; rätta i CSV:n |
| `src/app/words/word-catalog.ts` | Vad en glosa är, hur den identifieras, och hur en lista läses |
| `src/app/words/word-selector.ts` | Vilket ord som kommer härnäst, och i vilket steg |
| `src/app/words/distractors.ts` | Felsvaren, och varifrån de kommer |
| `src/app/training/word-state.ts` | De fyra stegen, och de rena reglerna för vad ett ord kan |
| `src/app/training/spelling.ts` | Rättningen av ett skrivet svar: rätt, nästan, fel |
| `src/app/training/session.ts` | Sessionsdirigenten — vad som ska övas härnäst, och när passet är slut |
| `src/app/training/training-engine.ts` | Vad appen tror om den som övar, och vad den gör med det |
| `src/app/services/progress-store.ts` | Det lagrade dokumentet, dess version och dess normalisering |
| `src/app/match-view/` | Steg 1: para ihop ord och översättning |
| `src/app/swipe-view/` | Steg 2 och 3: sant/falskt och återkalla, på samma kort |
| `src/app/write-view/` | Steg 4: skriv svaret |
| `src/app/session-view/` | Passets ram: mätare, vyväxling och avslutning |
| `src/app/home-view/`, `src/app/map-view/` | Välj lista; se vad varje ord kan, steg för steg |
| `src/styles/` | Delad stilmall: `_tokens.scss`, `_base.scss`, `_ui.scss` |
| `docs/plan.md` | Vad som är avgjort, vad som är öppet, och vilka konstanter som är gissningar |

## Orden

Listorna kommer från [`data/glosor.csv`](data/glosor.csv), som är formatet en
lärare faktiskt lämnar ifrån sig:

    Vecka;Engelska;Svenska;Felsvar_engelska;Felsvar_svenska
    1 - Familj;mother;mamma;father, sister, grandmother;pappa, syster, mormor

En sjätte kolumn, `Alternativ_svenska`, är frivillig och blir de former som
godtas i skrivsteget utöver facit — `hunden` för `hund` är inte ett stavfel
utan en annan form.

    npm run words

skriver om `src/app/words/word-lists.json`. Rätta i CSV:n och kör om; JSON:en
är genererad och ska inte redigeras för hand.

Att felsvaren står i listan i stället för att räknas fram är ett beslut, och
det viktigaste beslutet om innehållet: dras alla felsvar ur samma tio ord går
det att svara rätt på `dog = katt` genom att veta att `katt` hör till `cat`,
utan att veta vad `dog` betyder. Ett skrivet felsvar får komma från veckans
tema i stort. Saknas felsvar faller appen tillbaka på blocket, så att en lista
med bara två kolumner ändå går att öva på.

## Tre lager

Appen är delad så att pedagogiken inte sprids ut över händelsehanterare:

| Lager | Vad det avgör |
| --- | --- |
| Vyerna | Vad som står på skärmen |
| `TrainingSession` | Vilken uppgift som kommer härnäst, och när passet är slut |
| `TrainingEngine` | Vad den som övar kan, och vad ett svar betyder |
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
    npm run words  # bygger om ordlistorna ur data/glosor.csv

För maskiner utan node kör `docker compose up` dev-servern i en container och
exponerar den på [http://localhost:4200](http://localhost:4200).

## Driftsättning

`.github/workflows/pages.yml` bygger varje push till `main` med
`--base-href /svengelska/` och publicerar `dist/browser` till GitHub Pages.
Inget committas till repot; Pages-källan måste vara satt till *GitHub Actions*
under Settings → Pages.

Står källan fel faller `deploy` med `HttpError: Not Found` och
`Failed to create deployment (status: 404)` — bygget är då grönt och bara
publiceringen fallerar. Rätta inställningen och kör om körningen; det röda
jobbet från det första försöket ligger kvar i Actions-vyn även efteråt.

En pull request kör bara `build` (tester och bygge). Artefakten laddas upp och
`deploy` körs enbart från `main`, så en PR kan aldrig ta plats i Pages
deploy-kö.
