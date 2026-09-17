# Svengelska

> **Den här grenen är en nerskalad version.** Tre av appens fyra steg är
> avstängda, och kvar står svepet ensamt — mätt mycket noggrannare i utbyte.
> Varför, och vad testet ska svara på, står i
> [`docs/nerskalad.md`](docs/nerskalad.md). Appen som helhet beskrivs
> fortfarande av [`docs/plan.md`](docs/plan.md).

Glosträning där veckans glosor svepas rätt eller fel — `dog = hund`, stämmer
det? — åt båda hållen, mot ett tempo som mäts om varje varv.

    höger = sant      vänster = falskt      ner = vet ej

Det tredje svaret är inte en bekvämlighet. Med två alternativ är ett
sant/falskt-kort ett myntkast: hälften av alla blinda gissningar ser ut som
kunskap, och den bruskällan är lika stor som det appen försöker mäta. «Vet ej»
tar bort den vid källan, och är därför billigare än att chansa — ett fel tar
ordet till botten i repetitionsplanen, en ärlig lucka bara en låda ned.

**Ett varv är tio ord åt båda hållen.** `dog → hund` och `hund → dog` är två
färdigheter och mäts som två, med var sin dom och var sin fart. Först i varvet
ligger fyra lätta ord som ingen räknar: de mäter hur fort en tumme svepar ett
ord man redan kan, och allt därefter bedöms som kvot mot det golvet. Fyra golv,
faktiskt — att förkasta `dog = katt` tar längre tid än att bekräfta `dog = hund`
även för den som kan ordet, så sant och falskt mäts var för sig, åt vardera
hållet.

Under ytan ligger en repetitionsplan som avgör vilka tio ord ett varv består av.
Den syns aldrig: ingen graf, inga intervall, ingen «nästa repetition om fyra
dagar». Det enda som ställs in är hur många *nya* ord ett dygn får introducera,
och det valet vet en förälder bättre än en mätning.

Appen går att öva i: välj veckan på startsidan, tryck igång, och svepa tills
varvet är slut.

## Vad som finns

| Path | Vad det är |
| --- | --- |
| `data/glosor.csv` | Ordlistorna som de skrivs — en rad per glosa, en kolumn per vecka |
| `src/app/words/word-lists.json` | Samma listor som appen läser dem. Genererad; rätta i CSV:n |
| `src/app/words/word-catalog.ts` | Vad en glosa är, hur den identifieras, och hur en lista läses |
| `src/app/words/word-selector.ts` | Den gamla vägen: viktat urval ord för ord. Gömd, inte raderad |
| `src/app/words/distractors.ts` | Felsvaren, och varifrån de kommer — åt båda hållen |
| `src/app/training/scope.ts` | Vilka steg som når skärmen. Den enda filen att röra för att ta tillbaka de tre |
| `src/app/training/word-state.ts` | De fyra stegen, de fyra utfallen, och vad ett svar gör med lådan |
| `src/app/training/schedule.ts` | Repetitionsplanen: vad en låda betyder i dygn |
| `src/app/training/round.ts` | Varvets tio ord, och ordningen på de tjugo korten |
| `src/app/training/calibration.ts` | De lätta orden som mäter sveptakten |
| `src/app/training/spelling.ts` | Rättningen av ett skrivet svar: rätt, nästan, fel |
| `src/app/training/session.ts` | Varvsdirigenten — vad som kommer härnäst, och när varvet är slut |
| `src/app/training/training-engine.ts` | Vad appen tror om den som övar, och vad den gör med det |
| `src/app/services/progress-store.ts` | Det lagrade dokumentet, dess version och dess normalisering |
| `src/app/match-view/`, `src/app/write-view/` | Steg 1 och 4. Avstängda av `scope.ts`, kvar i koden |
| `src/app/entry-picker/`, `src/app/training/entry.ts` | Ingångsvalet. Avstängt av samma skäl — en dörr är inget val |
| `src/app/swipe-view/` | Kortet: tre riktningar, och reglerna för när ett drag är ett svar |
| `src/app/session-view/` | Varvets ram: mätare och avslutning |
| `src/app/home-view/`, `src/app/map-view/` | Välj vecka och antal nya ord; se vad varje ord kan, åt båda hållen |
| `src/styles/` | Delad stilmall: `_tokens.scss`, `_base.scss`, `_ui.scss` |
| `docs/nerskalad.md` | Den nerskalade grenen: vad som göms, vad som tillkommer, var planen fick ge sig |
| `docs/plan.md` | Appen som helhet: vad som är avgjort, vad som är öppet, vilka konstanter som är gissningar |

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
| `TrainingSession` | Vilken uppgift som kommer härnäst, och när varvet är slut |
| `TrainingEngine` | Vad den som övar kan, och vad ett svar betyder |
| `ProgressRepository` | Var byten ligger |

En vy skickar *gesten* — `affirm`, `deny` eller `unsure` — och hur lång tid det
tog, och läser aldrig en tröskel för att räkna ut vad det betyder. Om svaret var
i tempo och vad det gör med repetitionsplanen är motorns sak. Motorn äger i sin tur inga rena regler; de ligger i
`word-state.ts`, där varje funktion har formen

    gammalt tillstånd + ny händelse = nytt tillstånd

och därför går att pröva utan en spelare.

## Vad som sparas, och varför just det

Ett ord har ingen samlad poäng, och inte heller *ett* mått. Det har ett mått per
steg och **per riktning**, eftersom `dog → hund` och `hund → dog` är två
färdigheter:

    en:dog=hund    sitter     låda 4
    sv:hund=dog    inte lärt  låda 0

Fyra beslut i den formen är värda att känna till innan man ändrar i den:

**Tillståndet lagras inte, det härleds.** Det finns inget fält som säger att
ordet «sitter». Etiketten räknas fram ur måtten vid visning — sparades båda
skulle de kunna glida isär, och då är frågan vilken som är sann. Undantaget är
lådan i repetitionsplanen, och skälet står i
[`docs/nerskalad.md`](docs/nerskalad.md): ett fönster på fem svar kan inte bära
ett intervall på trettiotvå dygn.

**Farten lagras som kvot mot kanalens golv, aldrig som sekunder.** En kanal är
riktning × sanningsvärde, alltså fyra. Att förkasta `dog = katt` tar längre tid
än att bekräfta `dog = hund` även för den som kan ordet perfekt, och mäts båda
mot samma snitt får varje falskt påstående en straffavgift som inte har med
kunnandet att göra. Golvet mäts bara på kalibreringskorten — ord som redan
sitter — så att «i tempo» inte glider uppåt precis när tröskeln behöver hålla
emot.

**Ett svar har fyra utfall, inte två.** `hit` är rätt i tempo, `slow` rätt men
segt, `miss` fel, `unsure` en ärlig lucka. De två sista är samma svar på frågan
«sitter det?» men helt olika i planen och på kartan: tre `miss` är ett ord som
lärts in fel, tre `unsure` ett som aldrig lärts in, och åtgärden skiljer sig.

**Ett ord är klart först när båda hållen är det.** Den svagare riktningen
avgör, både när ordet räknas som helt och när det behöver ses igen. Att låta det
lätta hållet tala för ordet vore att visa medelvärdet av två färdigheter och
kalla det en.

*(I appen som helhet gäller dessutom att igenkänning aldrig ensam når
«automatiserat» — regeln ligger kvar i `word-state.ts` och gäller igen den dag
skrivsteget slås på.)*

Domen i ett steg vilar på de fem senaste svaren: fyra rätt för att bli
behärskad, två missar i samma fönster för att sluta vara det. Att trösklarna
skiljer sig uppåt och nedåt är vad som gör att etiketten inte blinkar över
gränsen, och det kostar inget extra lagrat tillstånd.

Allt ligger i `localStorage` under en nyckel, `svengelska-progress`, och
`services/progress-store.ts` är den enda filen som vet det. Dokumentet bär ett
`schemaVersion`, och den nerskalade grenen är första gången raden gör nytta:
version 2 delade upp baslinjerna i kanaler, gjorde utfallet fyrsiffrigt och gav
dokumentet inställningar. Ett dokument skrivet av version 1 går att öva vidare
på — inte för att formen är helig, utan för att ett barn som redan lagt tjugo
varv inte ska förlora dem för att appen bytte form.

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
