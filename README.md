# Svengelska

> **Den här grenen är en nerskalad version.** Tre av appens fyra steg är
> avstängda, och kvar står svepet ensamt — mätt mycket noggrannare i utbyte.
> Varför, och vad testet ska svara på, står i
> [`docs/nerskalad.md`](docs/nerskalad.md). Appen som helhet beskrivs
> fortfarande av [`docs/plan.md`](docs/plan.md).

Glosträning där orden svepas rätt eller fel — `dog = hund`, stämmer det? — åt
båda hållen, mot ett tempo som mäts om varje varv.

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

De lätta orden är elevens egna: behärskade ord om sådana finns, annars ord ur
startrundans trappa från de två stegen under nivån (`warmupWords()`), och bara
för den som inte gjort trappan mätstickan `dog`, `red`, `yes`. Så var det inte
först — loggen visade `red = röd` inleda varv för en vuxen som klarade
`although`.

Under ytan ligger en repetitionsplan som avgör vilka tio ord ett varv består av.
Den syns aldrig: ingen graf, inga intervall, ingen «nästa repetition om fyra
dagar». Det enda som ställs in är hur många *nya* ord ett dygn får introducera,
och det valet vet en förälder bättre än en mätning.

Appen går att öva i: välj veckan på startsidan, tryck igång, och svepa tills
varvet är slut.

## Vad som finns

| Path | Vad det är |
| --- | --- |
| `data/glosor.csv` | Listorna som följer med bygget — en rad per glosa, första kolumnen är listans namn |
| `src/app/words/word-lists.json` | Samma listor som appen läser dem. Genererad; rätta i CSV:n |
| `src/app/words/word-catalog.ts` | Vad en glosa är, hur den identifieras, och hur en lista läses |
| `src/app/words/word-library.ts` | Alla listor: byggets och de som appen skrivit. Det vyerna frågar |
| `src/app/words/generated-list.ts` | En lista som appen skriver själv: uppdraget till modellen, och vad som godtas av svaret |
| `src/app/services/list-writer.ts`, `claude-call.ts` | Önskemål in, lista ut — och det enda anropet till Anthropic |
| `src/app/services/api-key-store.ts`, `list-store.ts`, `profile-store.ts` | Var nyckeln, de egna listorna och profilen ligger |
| `src/app/intro/` | Startrundan: korten som lär känna den som övar, och profilen de blir |
| `src/app/intro/skill.ts`, `personality.ts` | Nivån och personligheten som de spåras: startrundan först, varven sedan |
| `src/app/intro/breaks.ts`, `services/break-deck.ts` | Avbrotten: något helt annat mitt bland orden, och vad som byggs vidare på dem |
| `src/app/intro/intro-writing.ts`, `services/intro-writer.ts` | Startrundans påståenden skrivna av Claude, när det finns en nyckel |
| `src/app/intro-view/` | Startrundan på skärmen — appens vanliga kort, med frågor i stället för glosor |
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
| `src/app/services/data-export.ts` | Allt appen mätt som en text att kopiera, för analys. Aldrig nyckeln |
| `src/app/services/tracker.ts` | Loggen: varje tryck, drag, kort och svar, medan appen utvecklas |
| `src/app/match-view/`, `src/app/write-view/` | Steg 1 och 4. Avstängda av `scope.ts`, kvar i koden |
| `src/app/entry-picker/`, `src/app/training/entry.ts` | Ingångsvalet. Avstängt av samma skäl — en dörr är inget val |
| `src/app/swipe-view/` | Kortet: tre riktningar, inga knappar, och reglerna för när ett drag är ett svar |
| `src/app/session-view/` | Varvets ram: mätare och avslutning |
| `src/app/home-view/`, `src/app/map-view/` | Välj vecka och antal nya ord; se vad varje ord kan, åt båda hållen |
| `src/styles/` | Delad stilmall: `_tokens.scss`, `_base.scss`, `_ui.scss` |
| `docs/nerskalad.md` | Den nerskalade grenen: vad som göms, vad som tillkommer, var planen fick ge sig |
| `docs/plan.md` | Appen som helhet: vad som är avgjort, vad som är öppet, vilka konstanter som är gissningar |

## Orden

Listorna som följer med bygget kommer från [`data/glosor.csv`](data/glosor.csv):

    Lista;Engelska;Svenska;Felsvar_engelska;Felsvar_svenska
    Familj;mother;mamma;father, sister, grandmother;pappa, syster, mormor

Första kolumnen är listans namn. Här stod förut en vecka — `1 - Familj` — från
tiden då appen var byggd kring en glosläxa i taget. En lista är nu ett tema och
ingenting mer, och de flesta listor kommer inte härifrån utan skrivs av appen.

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

### Listor som appen skriver

Den som inte har repot behöver ingen CSV. Under «Ny lista» på startsidan ger man
ett önskemål — `rymden, årskurs 4`, eller veckans läxa inklistrad — och appen
skriver glosorna och felsvaren med Claude. Orden visas inte först: listan sparas
och varvet sätter igång direkt. Valet av ord ligger under ytan, som
repetitionsplanen. Den som gjort startrundan och har en nyckel behöver inte ens
be — när rundan är slut skriver appen den första listan ur svaren.

Startrundan slutar med ett påstående: *Du vet vem jag är nu.* Sant går till
glosorna. Falskt ger tre påståenden till, skrivna av Claude utifrån det som redan
svarats (`intro/follow-up.ts`). De skrivs som ett sant/falskt-träd tre steg djupt, så att nästa kort alltid finns när det förra svepts,
och nästa träd skrivs medan de två sista besvaras. Svaren sparas i profilen och
väger tyngst när orden väljs.

Dagsgränsen för nya ord är avstängd tills vidare (`limitNewWords` i
`training/training-engine.ts`). Med den på tog en lista dagens nya ord, och nästa
lista spelades då med den förras ord.

Det kräver en egen Anthropic-nyckel, som läggs in på samma ställe. Appen har
ingen server: nyckeln ligger i webbläsarens `localStorage`, skild från
framstegen, och skickas bara till Anthropic. Den som delar dator med andra bör
veta att den ligger där i klartext, och det är klokt att ge nyckeln en egen
utgiftsgräns i Anthropics konsol.

Regeln om felsvaren ovan gäller de skrivna listorna hårdare än de handskrivna:
ett felsvar som står som glosa i samma lista tas bort av koden, vad modellen än
svarade.

### Startrundan

Den som öppnar appen första gången möts inte av en lista utan av några kort om
sig själv, svepta med samma tre gester som resten: `Jag lyssnar på musik varje
dag`, `Jag har sett samma film fler än tre gånger`. Efter fyra sådana kommer
ålder och skäl, och sedan blandas tre sorters kort:

- **En trappa av riktiga ord**, nio steg från `cat` till `obsequious`, med en
  fälla på varje steg (`eventually = eventuellt`, `sensible = sensibel`). Den
  börjar där åldern säger att det är troligt — en vuxen vid `reluctant`, ett
  barn vid `cat` — och går upp eller ner tills ett klarat steg ligger under ett
  som inte höll.
- **Fem påståenden om hur man vill ha det**: om det får vara svårt, om udda ord
  är roliga, om orden ska gå att använda direkt, om man tröttnar fort, och om
  man chansar hellre än säger vet ej. Varje drag är med för att det ändrar
  något i en lista. Se `intro/personality.ts`.
- **Resten av intressena**, valda efter åldern: en vuxen tillfrågas om engelska
  i jobbet, en tioåring om rymden.

Efter varje trappsteg kommer ett avbrott (se nedan) och ett påstående, så att
det inte blir ett prov i slutet. Så
var det inte först: tolv intressen, sedan ålder, sedan trappan från `cat` med
fem steg. Loggen från en vuxen som läser engelska till vardags visade vad det
gav — taket nått på åtta kort, en första lista om mjöl och deg, och sedan
Skolan med nitton rätt av tjugo. «Lite fånigt enkelt.»

**Med en nyckel skrivs påståendena av Claude** (`intro/intro-writing.ts`). Så
fort åldern är avgjord beställs resten av rundan: åtta påståenden som vart och
ett öppnar ett ordområde, vardagliga och knasiga om vartannat, och ett eget
påstående per personlighetsdrag, formulerat för just den eleven och ibland vänt
så att det inte lönar sig att svara sant på allt. Under tiden — skälet och
trappans första steg, ungefär vad det tar att skriva dem — ligger de fasta
påståendena kvar, och de tar över helt om det inte går. Ingen väntar. Kortet som
ligger framme byts aldrig ut. Trappan skrivs inte om: den är ett instrument, och
ett instrument som skrivs om för varje mätning mäter inte samma sak två gånger.

Svaren blir en profil: intressen, ett åldersspann, om man övar frivilligt, hur
man vill ha det, och var det är lagom att börja. Med den kan appen välja tema
själv («Välj åt mig» under «Ny lista»), och det är så samma app kan skriva om
stallet åt en tioåring och om jobbresor åt en fyrtiofemåring utan att någon
ställer in en nivå.

Nivån skickas till modellen som *ord* och inte som en siffra — «klarar
`reluctant` men inte `to sue`» — eftersom det betyder samma sak för alla som kan
engelska. Åldern skickas som ett spann, aldrig som ett tal, och inget namn
frågas efter. Varje kort går att hoppa över, och hela rundan likaså.

### Avbrotten

Mitt bland orden ligger ibland ett kort som inte har med engelska att göra:
`Jag har sett ett norrsken`, `Jag tycker att ananas hör hemma på pizza`. Inget på
kortet säger att det är ett avbrott — för den som sveper är det bara nästa kort,
och det svaras på som alla andra påståenden. Ett kommer efter
varje trappsteg i startrundan, ett mitt i varje varv, och så många man hinner
medan en lista skrivs — väntan är femton, tjugo sekunder, och loggen visade dem
gå åt till att trycka på en avstängd knapp. Det räknas inte i
varvet, rör inte sviten och mäts inte.

Knasigt får det vara, men aldrig meningslöst. Varje avbrott finns för att ett ja
*öppnar* ett ordområde: `Jag har klappat en ko` öppnar bondgården, `Jag har lagat
något trasigt med tejp` verktygslådan. Området står på varje frö, följer med
svaret in i profilen och står bredvid svaret när en lista skrivs. Ett avbrott
som inte öppnar något hör inte hemma — `Jag kan vissla med fingrarna` stod med
först och är borttaget — och ett som Claude skrivit utan område visas inte.

Det bryter också av — tjugo sant/falskt-kort i rad är ett prov — och ett ja
byggs vidare på på två sätt:

- **Nästa avbrott.** En del frön har en följdfråga som kommer om svaret var ja
  (`Jag har stått ute mitt i natten för att se norrsken`). Den måste gå att
  förstå ensam: den kommer ett avbrott senare, och «Jag skulle vilja träffa
  det» gav tio sekunders tvekan och ett hoppa över. Med en nyckel skriver
  Claude nya avbrott i bakgrunden utifrån allt som svarats: ett som går djupare
  i något eleven sagt ja till, och resten helt nya.
- **Nästa lista.** Svaren skickas med när en lista skrivs, och modellen ombeds
  ta temat ur ett oväntat ja när den väljer själv.

Utan profil visas inga avbrott: det finns då inget att bygga vidare på dem i.

### Nivån och personligheten spåras

Startrundan är en första gissning. Efter den växer profilen av sig själv, och i
båda fallen lagras det som hänt och inte slutsatsen — vad appen tror räknas fram
vid läsning:

**Nivån** flyttas av ord som aldrig setts förut. Första försöket på ett nytt ord
är det enda kort där «rätt i tempo» betyder *kunde redan*, så varje varv
antecknar hur många nya ord det hade och hur många som satt direkt, och vilken
nivå listan skrevs för. Satt minst 85 % låg listan under nivån, och nivån går
upp till steget ovanför listan; satt högst 25 % går den ner. Nivån flyttas
aldrig längre än listan bär: Skolan (räknad som steg 1) med nitton rätt säger
inget om den som redan står på steg 4. Varje skriven lista bär nivån den skrevs
för, och det är den nivån — inte provets — som nästa lista skrivs mot.

**Personligheten** vägs ihop av vad någon sa och vad hen gör. Två av dragen syns
i övningen: den som lämnar varv efter några kort, och den som har många fel men
få «vet ej». Där tar beteendet över i takt med att det blir mer av det. Ett varv
som lämnas på första kortet räknas inte — den som gör det har valt fel lista,
inte gett upp.

Görs startrundan om behålls vanorna, men inte varvens anteckningar om nivån: ett
nytt prov är en ny utgångspunkt. En profil från före trappans nio steg flyttas
till den nya skalan när den läses.

### Börja om

Under Inställningar ligger «Börja om». Den tar framstegen, profilen och de egna
listorna, och appen börjar om med startfrågorna. Nyckeln ligger kvar — att
klistra in den igen är det jobbigaste steget av alla — och loggen likaså, så att
omstarten syns i den. Här fanns förut bara «Nollställ framstegen», och loggen
visade den följas av «Gör om startfrågorna» medan profilen och de gamla listorna
låg kvar.

## Svep, och tryck där det är ett val

Appen har ett kort och tre håll. Varje kort som frågar något är ett påstående,
och svaret är om det stämmer:

    höger = sant      vänster = falskt      ner = vet ej

Det gäller gloskorten (`dog = hund`) och korten om en själv (`Jag har klappat en
ko`) lika, och det tredje hållet heter «hoppa över» på de senare. Så var det inte
först: gloskorten svarades med rätt och fel, korten om en själv med ja och nej,
och slutet av startrundan var en fråga. Två sorters svar på samma sorts kort.
Det Claude skriver — följdfrågor och avbrott — ska följa samma regel, och
uppdragen säger det.

Där gäller bara svepet. Under kortet står en rad som säger vad hållen heter, och
ett tryck på den svarar inte — kortet glider en bit åt det hållet, stämplas och
glider tillbaka, som en visning av gesten. Ett tryck på själva kortet får det
att vicka. Svaret är svepet, och tiden det tar är vad som mäts.

På de kort som är vägval och inga frågor går raden däremot att trycka på, och
gör då det den säger:

| Kort | Vänster | Ner | Höger | Tryck på kortet |
| --- | --- | --- | --- | --- |
| Startsidan | nästa lista | ny lista | förra listan | kör listan |
| Varvet klart | hem | kartan | en gång till | en gång till |
| Startrundan klar | — | — | vidare | vidare |

Startsidan är en bunt som bläddras åt båda hållen, och ett kort man vill in i
trycker man på. Så var det inte först: höger hette «kör» och vänster «nästa»,
eftersom höger är «ja» på ett gloskort. Loggen från första besöket visade vad
det kostade — vänster är «nästa» för den som bläddrar, och då är höger
«tillbaka». Raden under kortet fick tio tryck på fyra minuter av någon som läste
den som knappar, och startrundan gjordes två gånger utan att sparas, därför att
slutkortets vänster hette «gör om». Regeln som kom ur det: **svepet är svaret på
en fråga, men ett val ska gå att trycka på, och ett håll får aldrig kasta bort
arbete.**

Det som inte går att svepa ligger under kortet och inte på det: fältet där man
skriver ett önskemål eller klistrar in en nyckel, och inställningarna. Kvar som
knappar är också «Avsluta» mitt i ett varv och «Hoppa över» i startrundan.

### Sviten

Överst i varvet står en svit: rätta svar i tempo sedan det senaste felet. Den
växer av ett rätt i tempo, nollas av ett **fel**, och rörs inte av ett «vet ej»
eller av ett rätt som var segt.

Det är samma räkning som gav kortet sitt tredje svar, fast nu på skärmen. Priset
på en gissning låg förut bara i repetitionsplanen, som ingen ser. Med sviten
behåller den som inte vet sitt tal genom att säga det, och riskerar det genom
att chansa. Den längsta sviten står stort på slutkortet, och är det enda rekord
appen håller.

### Utseendet

Formspråket heter Arkad: mörk botten, tjocka kort som klistermärken, och fyra
färger som var och en betyder en sak — gult är kortet, mint är framåt, korall är
fel, violett är det som ligger under och bakom. Reglerna står överst i
`src/styles/_tokens.scss`. Typsnitten, Unbounded och Inter, ligger i bygget och
hämtas inte från nätet.

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

## Loggen

Medan appen utvecklas sparar den allt som händer, inte bara vad som blev av det:

| Händelse | Vad den bär |
| --- | --- |
| `down`, `click` | Var på skärmen, och på vad — också tryck som inte träffade något |
| `card` | Vad som stod på kortet och vad hållen hette |
| `drag` | Fingrets hela väg, hur länge kortet låg innan det rördes, och om draget blev ett svar |
| `answer`, `void` | Hållet, om det kom som svep eller tangent, och tiden — `void` är ett håll som inte fanns |
| `outcome` | Vad motorn gjorde av svaret: utfall, låda före och efter, sviten |
| `nav`, `round`, `round.end`, `leave`, `intro.end` | Var man var och vart man gick. `round.end` bär också listans nivå och nivån före och efter varvet |
| `list.ask`, `list.got`, `list.failed`, `list.keep`, `list.drop` | Vad som önskades av Claude och vad som kom tillbaka |
| `intro.ask`, `intro.got`, `intro.failed`, `followup.ask`, `break.ask` | Det Claude skrev åt startrundan, följdfrågorna och avbrotten |

Varje fråga till Claude loggas i sin helhet (`request`), och svaret likaså. Det
är det enda sättet att i efterhand se varför någon fick de kort hen fick. För
listorna loggas allt utom glosorna eleven redan har, som kan vara hundratals och
redan står i exporten.
| `break`, `break.got`, `break.failed` | Ett avbrott och svaret på det, och avbrotten Claude skrev |
| `visible`, `error`, `setting`, `export`, `track` | Det som förklarar resten |

Ett drag som släpps halvvägs loggas som ett drag utan svar, och ett tryck på
raden under kortet loggas som just det. Det är sådant framstegen inte kan
berätta, och skälet till att loggen finns.

Den ligger i `localStorage`, ett besök per post, med ett tak där de äldsta
besöken kastas. Den lämnar aldrig enheten av sig själv — det finns ingen server
— utan exporteras för hand under Inställningar: som fil tillsammans med datat,
eller som text. Det som skrivs i ett fält loggas aldrig; loggen ser att någon
tryckte på nyckelfältet, inte vad som står i det.

Loggen är på från början. Det är `TRACK_BY_DEFAULT` i `tracker.ts`, och den dag
appen inte längre är under utveckling är det den raden som ska ändras. Reglaget
under Inställningar stänger av den för en enskild webbläsare.

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
