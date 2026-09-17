# Nerskalad version — svepet ensamt

Arbetsanteckningar för grenen `claude/scaled-down-sweep-test-bqv1os`. Det här är
ett **test**, inte en ny riktning för appen: fyra steg blir ett, och i utbyte
mäts det enda steg som blir kvar mycket noggrannare än i dag.

`docs/plan.md` beskriver appen som helhet och gäller fortfarande. Det här
dokumentet beskriver vad som *stängs av*, vad som *tillkommer*, och vad som
måste avgöras innan det går att bygga.

---

## Vad testet ska svara på

Fyrastegsstegen mäter fyra färdigheter, och därför mäter den ingen av dem
särskilt väl — ett ord behöver tio–femton svar innan någon av de fyra domarna
vilar på något. Frågan den här grenen ställer är den omvända:

> Om allt utom svepet stängs av, och samma ord i stället svepas i **båda**
> riktningarna mot ett **mätt** tempo — säger då sant/falskt ensamt tillräckligt
> för att en repetitionsplan ska gå att lita på?

Det är en fråga om mätkvalitet och inte om innehåll. Går den åt rätt håll är
kalibreringen, snittuppdelningen och det tredje svaret värda att bära tillbaka
in i alla fyra stegen; går den åt fel håll har grenen kostat en gren.

Frågan går inte att besvara med två svarsalternativ, och det är skälet till att
kortet får tre. Ett sant/falskt-kort är ett myntkast: hälften av alla blinda
gissningar ser ut som kunskap i loggen, och den bruskällan är exakt lika stor
som den effekt testet vill mäta. Se «Tre svar» nedan.

---

## Vad som blir kvar, och vad som göms

Kvar blir **ett** steg: `trueFalse`. Match, Återkalla och Skriva göms — de
raderas inte.

Skillnaden är viktig. `word-state.ts` är appens enda sanning om stegen, och dess
regler (`settled()`, `currentStep()`, `stateFor()`) är oförändrat riktiga även
när bara ett steg spelas. Rivs `STEPS` ned till ett element går både domen, den
härledda etiketten och varje lagrat dokument sönder, och grenen går inte att
kasta bort utan att också kasta bort vägen tillbaka.

Därför en spärr och ingen sax — `src/app/training/scope.ts`:

    /** Stegen som spelas. Resten finns kvar i koden men når aldrig skärmen. */
    export const ACTIVE_STEPS: readonly Step[] = ['trueFalse'];

och tre ställen som läser den:

| Fil | Vad som ändras |
| --- | --- |
| `training/session.ts` | Bygger bara `trueFalse`-uppgifter; `match`- och `written`-grenarna blir onåbara |
| `training/word-state.ts` | `trainingStep()`:s stödsteg får aldrig gå under det lägsta aktiva steget |
| `home-view/`, `session-view/` | Ingen ingångsväljare — det finns en dörr, och då är den inte ett val |

Den andra raden är den enda som kräver eftertanke. I dag får ett ord som missat
två gånger i rad stöd av steget under, **och stödet klampas medvetet inte mot
golvet** (se kommentaren i `trainingStep()`). Med bara `trueFalse` aktivt finns
inget under, och stödet skulle peka på en vy som inte längre ritas. Regeln blir
alltså: stödet får gå under användarens golv, men aldrig under det *aktiva*
golvet. Att de två golven skiljs åt är hela ändringen.

`match-view/` och `write-view/` blir orörd, kompilerande, otestad-i-pass kod
under testet. `swipe-view` behåller sin `recall`-halva — den kostar ingenting
att låta ligga kvar, och `SwipeCard` är redan en union.

Kartan (`map-view/`) visar fyra fält per ord. Under testet visar den ett fält
per ord **och riktning**, alltså två rader per glosa. Det är inte kosmetik: det
är den enda ytan där det går att se att `hund → dog` släpar efter `dog → hund`,
och det är precis vad testet vill se.

---

## Varvet: tio ord, två riktningar

Ett varv är **tio ord åt båda hållen** — tjugo kort som räknas.

Riktningen finns redan förberedd i dokumentet: `wordKey()` skriver `en:dog=hund`
och prefixet lades dit just för att `sv:hund=dog` skulle kunna bli en egen kanal
utan att någon anropare skrivs om. Listorna bär redan `distractorsEn` för
felsvaren åt det hållet. Det här är alltså «Steg 7 — den andra riktningen» i
`docs/plan.md`, inhämtat i förtid därför att det nerskalade varvet kräver det.

Det betyder tre saker:

**Ett ord blir två poster.** `en:dog=hund` och `sv:hund=dog` har var sitt
`WordRecord`, var sin dom och var sin fart. Det är rätt: `hund → dog` är en
annan och svårare färdighet, och `docs/plan.md` avgjorde redan att slå ihop dem
vore att göra måttet till ett medelvärde av två saker.

**Ett ord blir en rad i planen.** Repetitionen schemaläggs per *ord*, inte per
riktning, och varvet visar båda hållen av de tio ord som står på tur. Annars
skulle riktningarna glida isär i tid och «tio ord åt båda hållen» bli tio
godtyckliga kort. Ordet är moget när båda riktningarna är det; det är den
svagare riktningen som styr när ordet kommer tillbaka.

**Påståendet byggs åt rätt håll.** `statementFor()` får en riktning: frågan är
`hund`, facit är `dog`, och felsvaret hämtas ur `distractorsEn` med
`distractorsSv` som spegelvänd reserv. Fördelningen sant/falskt (`TRUE_SHARE`)
gäller oförändrat per riktning — annars går det att lära sig att svenska frågor
oftare är sanna, och det är ett mönster i gränssnittet och inte i språket.

De tjugo korten blandas, men inte fritt: samma glosas två riktningar får inte
ligga intill varandra. Ligger `dog = hund` direkt före `hund = dog` mäts
korttidsminnet och inte glosan, precis som `RECENT_MEMORY` redan hindrar för
samma kort. Spärren finns, den behöver bara veta att två nycklar kan vara samma
ord.

Ett kort som gick fel — eller som fick «vet ej» — kommer tillbaka **efter** de
tjugo, inte i stället för ett av dem. Varvet ska täcka varje ord åt båda hållen
minst en gång, och ett varv som kortas av sina egna misstag täcker minst där det
behövs mest.

---

## Tre svar: höger, vänster, ner

**Höger är sant, vänster är falskt, ner är «vet ej».** Uppåt är obundet och
fjädrar tillbaka — en gest som inte betyder något ska inte göra något.

Det tredje svaret är grenens viktigaste tillägg, och skälet är aritmetiskt och
inte pedagogiskt. Med två alternativ är ett kort ett myntkast: den som inte vet
svarar rätt varannan gång, och de svaren går in i domen, i snittet och i
repetitionsplanen som om de vore kunskap. Ett steg som mäter igenkänning kan
alltså inte skilja «kunde» från «gissade rätt», och just den skillnaden är vad
hela grenen undersöker. «Vet ej» är det enda som tar bort bruset vid källan.

### Priset måste räknas, inte kännas

En gest som är dyrare än att chansa kommer inte att användas, hur ärlig den än
är, och då är den värre än ingen gest alls — den ser ut som data.

Räkna på det. Kostar ett fel `C_fel` och ett «vet ej» `C_vetej`, så är den
väntade kostnaden för att gissa

    0,5 × C_fel

eftersom hälften av gissningarna går igenom gratis. Ärlighet är alltså det
rationella valet först när

    C_vetej  <  ½ × C_fel

Det är ett hårdare krav än det känns som. Ett «vet ej» som kostar *lika mycket*
som ett fel gör gissandet till den bättre strategin, och då har appen lärt
tummen att spela i stället för att svara. Lika pris räcker inte; priset måste
vara mindre än hälften.

Därav regeln, som också avgör öppen fråga 2 i sin gamla form:

| Svar | Vad det gör med lådan | Kommer tillbaka i varvet |
| --- | --- | --- |
| Rätt, i tempo | En låda upp | Nej |
| Rätt, men segt | Står kvar | Nej |
| **Fel** | **Till botten** | Ja |
| **Vet ej** | **En låda ned** | Ja |

Att felet är det hårdare av de två är rätt även utan räkningen: ett fel på ett
sant/falskt-kort är antingen en falsk föreställning eller en chansning, och båda
förtjänar nollställningen. Ett «vet ej» är en ärlig lucka — ordet är inte lärt
än, och att då kasta bort allt upparbetat vore att straffa den som säger sanning.

### Ner bär ingen fart

Ett «vet ej» lagras med `pace: null`. Tiden det tar att erkänna en lucka mäter
ärlighet och inte framplockning, och den ska inte röra vare sig kanalens golv
eller ordets egna mätningar.

Det kostar ingen kod: `recordAttempt()` hoppar redan över `pace === null`, och
baslinjen matas redan bara av rätta svar. Att det tredje svaret passar rakt in i
den apparaten är ett kvitto på att «farten lagras som kvot» var rätt beslut.

### Ner är det enda kortet som undervisar

Facit fram, och det står kvar längre än efter ett fel. Det finns ingen dom att
läsa — ingenting att rätta, bara något att lära — och då är hela kortets tid
undervisningstid. Det är också den enda gest i appen som den som övar kan
använda utan att först ha en åsikt.

### Utfallet blir tresiffrigt

`recent: boolean[]` räcker inte längre. Tre «vet ej» är ett ord som **aldrig
lärts in**; tre «fel» är ett ord som **lärts in fel**. Åtgärden skiljer sig —
introducera mot rätta — och slås de ihop till `false` försvinner skillnaden i
samma stund den uppstår.

    type Outcome = 'hit' | 'miss' | 'unsure';
    recent: Outcome[]

`hits()` räknar `'hit'`. Hysteresen nedåt räknar `'miss'` och `'unsure'`
tillsammans — för domen «sitter det?» är en lucka och ett fel samma svar. Det är
bara i planen och på kartan de skiljer sig, och det är där de ska skilja sig.

Schema 2 är ändå på väg att skrivas, så tri-tillståndet kostar en `migrate()`-rad
i stället för en egen version: `true → 'hit'`, `false → 'miss'`, och ingenting
som lagrats före grenen räknas som en lucka.

### Gesten

`cdkDragLockAxis="x"` faller, och `swipe-gesture.ts` generaliseras från en axel
till två:

- `DragSample` får ett `y`. `dragSpeed()` mäter längs den axel dragningen
  faktiskt gick.
- **Den dominerande axeln avgör.** Ett drag som är mest i sidled är ett
  sant/falskt-svar; ett som är mest nedåt är «vet ej». Diagonalen tillhör alltså
  den axel som vann, och inget drag är tvetydigt.
- **Den lodräta tröskeln är sin egen konstant**, och sannolikt högre än den
  vågräta. En nedåtknyck är billigare att göra av misstag än en sidledsknyck,
  och under kortet ligger en sida som rullar. Att ärva `THRESHOLD_RATIO` rakt av
  vore att gissa att de två gesterna kostar lika mycket i handen, och det gör de
  inte.
- **Uppåt gör ingenting.** Kortet följer med och fjädrar tillbaka.

Sidan rullar, och kortet måste därför ta den lodräta gesten från skalet medan
fingret ligger på det. Det är samma sorts fråga som klippet i sidled i
`app.component.scss`, och den har samma sorts svar — den bor i skalet och inte i
regeln.

Kortet får en tredje stämpel, nedåt, och raden under kortet en tredje knapp för
den som hellre trycker. Tangentbordet får piltangent ned. `ArrowUp` lämnas
obunden av samma skäl som gesten.

### Kalibreringen måste kunna avbrytas

Ett «vet ej» på ett kalibreringskort betyder att det lätta ordet inte var lätt.
Då är mätningen värdelös: golvet ska vara tiden för ett ord man kan, och det här
var inte ett. Provet kastas, ett nytt kort dras, och ordet lämnar den lätta
poolen tills det förtjänat sig tillbaka.

Utan den regeln kan ett enda glömt ord sänka golvet för hela varvet, och då blir
varje efterföljande ord orättvist bedömt som snabbt.

---

## Sveptakten: några lätta ord först

Det här är grenens egentliga idé.

I dag är «snabbt» en kvot mot ett rullande fönster av spelarens egna rätta svar
i samma steg. Det är rimligt men trubbigt: fönstret blandar ihop *hur fort en
tumme kan svepa* med *hur fort just det här ordet kommer*, och en trött kväll
på en liten telefon flyttar tröskeln för alla ord på en gång.

Därför **kalibreras** varje varv. Först i varvet ligger fyra kort med ord som
redan sitter — två sanna påståenden, två falska. De räknas inte i domen och inte
i planen. Vad de ger är ett golv:

    golv = tiden det tar att läsa, avgöra och svepa ett ord man redan kan

Allt som mäts efter det mäts som kvot mot det golvet, och tröskeln
«kan hen i tempo?» blir ett uttalande som håller: *det här ordet tog dubbelt så
lång tid som ett ord du kan*. Det är något annat än *det här ordet tog 2,4
sekunder*, och det är det enda av de två som betyder samma sak i morgon.

Var de lätta orden kommer ifrån:

1. I första hand spelarens egna behärskade ord, dragna ur blocken som redan
   övats. Det är de enda ord appen *vet* är lätta för just den här spelaren.
2. Finns inte fyra sådana ännu — första varvet någonsin — används en kort
   inbyggd lista som ligger i koden och inte i CSV:n, eftersom den är en
   mätsticka och inte en läxa.

Kalibreringen är också en uppvärmning, och det är en bonus och inte skälet.
Skälet är att fyra kort är ett billigt pris för att göra varenda efterföljande
kvot jämförbar med sig själv.

Golvet ägs inte av dagen ensam: dagens mätningar går in i ett rullande fönster
per kanal, så ett enstaka tappat kalibreringskort flyttar medianen men styr den
inte.

---

## Två snitt: sant och falskt

Att svara «rätt» på `dog = hund` är igenkänning. Att svara «fel» på
`dog = katt` är igenkänning **plus ett aktivt förkastande**, och det tar längre
tid för alla — även för den som kan ordet perfekt.

Mäts båda mot samma snitt får varje falskt påstående en straffavgift som inte
har med kunnandet att göra, och eftersom ungefär hälften av korten är falska
blir hälften av alla farter systematiskt för höga. Ett ord som råkat få många
falska kort ser då segare ut än ett som råkat få sanna.

Därför **två snitt**, och kalibreringen mäter båda:

    kanal = riktning × sanningsvärde
          = { en→sv sant, en→sv falskt, sv→en sant, sv→en falskt }

Ett svars fart är kvoten mot sin egen kanals golv. Fyra golv, inte ett.

Vad som *inte* delas upp är ordets egna lagrade farter. Ett ord sparar fem
mätningar (`MAX_SAMPLES`); delades de på sant och falskt blev det två och en
halv, och en median av två mätningar är ingen median. Kvoten är redan
kanaljusterad när den lagras, så det är samma sak — det är i nämnaren
uppdelningen behöver ligga, inte i täljaren.

---

## Spaced repetition under ytan

Under ytan, och osynligt: ingen graf, inga intervall på skärmen, ingen
«nästa repetition om 4 dagar». Den som övar ser tio ord och trycker igång.

Formen är Leitner, och det viktiga är att den **härleds ur det som redan
lagras** — samma beslut som `docs/plan.md` tog om tillståndet:

| Vad som behövs | Var det redan finns |
| --- | --- |
| Vilken låda ordet står i | `streak` — antal rätt i följd, nollas av ett fel |
| När ordet senast sågs | `lastSeen` |
| Om ordet svarats i tempo | Kvoten mot kanalens golv, `medianPace()` |

    låda      = min(streak, INTERVALS.length - 1)
    intervall = INTERVALS[låda]            // dygn
    moget     = lastSeen + intervall

och `INTERVALS` är någonting i stil med `[0, 1, 2, 4, 8, 16, 32]` — en gissning
som hör hemma i tabellen längst ned.

Två tillägg till den rena Leitner-trappan, båda för att grenens mätningar ska
betyda något:

**Ett rätt som var segt flyttar inte upp ordet.** Låg låda kvar, samma
intervall. Att kunna ett ord långsamt är inte att kunna det, och det är hela
poängen med att golvet mäts. Annars kunde ett ord vandra ut till trettiotvå
dygn på svar som varje gång tog tre gånger så lång tid som ett ord man kan.

**Ett fel och ett «vet ej» kostar olika.** Fel går till botten, «vet ej» en låda
ned — räkningen som ger den asymmetrin står under «Priset måste räknas». Här är
det värt att notera vad den kostar i lagring: `streak` nollas av båda, så lådan
går inte längre att härleda ur `streak` ensamt. Den måste läsas ur
`recent`-fönstret, som nu vet skillnaden. Det är fortfarande en härledning och
inget lagrat lådnummer, men den är en rad mer invecklad än trappan ovan låter
påskina, och den raden är värd ett eget test.

Varvets tio ord plockas i den här ordningen:

1. **Försenade** ord — mognadsdagen har passerat. Äldst först.
2. **Nya** ord, upp till dagens budget (se nedan).
3. **Närmast mogna** ord som utfyllnad, om de två första inte gav tio.

Räcker det ändå inte till tio blir varvet kortare, och appen säger det rent ut i
stället för att fylla ut med brus. Ett varv som låtsas vara tio ord långt när
det finns fyra att öva är en lögn om hur mycket arbete som återstår.

---

## Inställningar: nya ord per dag

En panel, ett reglage, ett tal: **nya ord per dag**. Standard 5, spann 0–20.

Talet är det enda i appen som styr hur fort det går framåt, och det är därför
det ska vara valbart: ett barn som ligger efter en vecka behöver kunna sätta
noll och bara repetera, och ett barn som har läsförhör på fredag behöver kunna
sätta tio utan att någon rör i koden.

    settings: { newWordsPerDay: number }

i framstegsdokumentet, eftersom det är en egenskap hos den som övar och inte hos
enheten.

Hur många nya som redan tagits i dag måste gå att veta, och en räknare som
nollas vid midnatt är ett fält som kan glida isär från verkligheten. I stället
härleds det — men det kräver ett nytt fält i `StepStat`:

    firstSeen: number | null   // sätts en gång, vid första svaret

och då är «nya ord i dag» = antalet ord vars `firstSeen` infaller i dag. Ett
fält som skrivs en gång och aldrig ändras kan inte glida.

Var de nya orden hämtas ifrån är inte avgjort — se öppen fråga 1.

---

## Dokumentet: schema 2

Det här är första gången `schemaVersion` gör nytta, och `migrate()` får sin
första gren.

| Vad | Från | Till |
| --- | --- | --- |
| `baselines` | `Record<Step, number[]>` | `Record<Channel, number[]>` — fyra kanaler |
| `settings` | *(finns inte)* | `{ newWordsPerDay: number }` |
| `StepStat.firstSeen` | *(finns inte)* | `number \| null` |
| `StepStat.recent` | `boolean[]` | `Outcome[]` — `'hit' \| 'miss' \| 'unsure'` |
| `words` | oförändrad form | oförändrad form; `sv:`-nycklarna är bara nya nycklar |

Migreringen från 1 till 2 är mild: gamla `baselines.trueFalse` kan bli
utgångspunkt för alla fyra kanalerna, `settings` får sitt standardvärde,
`recent` mappas `true → 'hit'` och `false → 'miss'`, och `firstSeen` blir `null`
för allt som redan finns — ett ord som setts före migreringen räknas alltså
aldrig som nytt i dag, vilket är rätt svar. Ingenting som lagrats före grenen
kan vara en lucka, eftersom gesten inte fanns.

`normalize()` i `progress-store.ts` gör redan det tunga arbetet: allt som inte
känns igen ersätts med sitt tomma värde i stället för att krascha övningen. Den
hållningen gäller oförändrat.

---

## Arbetsordning

Fem etapper, var och en grön för sig. Ingen av dem är stor, och ordningen är
vald så att varje etapp går att spela på en telefon innan nästa börjar.

**1 — Spärren.** `scope.ts`, stödsteget som inte får gå under aktivt golv,
sessionen som bara bygger `trueFalse`, startsidan utan ingångsväljare. Efter den
här etappen är appen den gamla appen med tre steg avstängda, och ingenting annat
är ändrat. Testerna för `word-state` ska vara oförändrade — reglerna är det.

**1b — Det tredje svaret.** Gesten på två axlar, den lodräta tröskeln, stämpeln,
knappen, piltangenten, och `Outcome` i stället för `boolean`. Ligger före
riktningen därför att allt som mäts efter den här etappen mäts renare: varje
varv som körs innan «vet ej» finns producerar data där hälften av gissningarna
ser ut som kunskap, och den datan vill ingen ha i baslinjen.

**2 — Riktningen.** `Direction` som typ, `wordKey()` med riktning,
`statementFor()` åt båda hållen, varvet som tjugo kort med spärr mot samma ords
två riktningar intill varandra, kartan med två rader per glosa. Schema 2 och
migreringen läggs här, eftersom `sv:`-nycklarna är första gången dokumentet
växer.

**3 — Golvet.** Kalibreringskorten, de fyra kanalerna, kvoten mot rätt kanal,
tempotröskeln i domen, och kalibreringsprovet som kastas av ett «vet ej».
Härifrån betyder «sitter» något annat än i dag, och det ska synas i
sammanfattningen efter varvet.

**4 — Planen.** Leitner-härledningen ur `recent`, de tre priserna (upp, botten,
en ned), mognadsdagen, varvets tre urvalskällor.
Ersätter `selectNext()`:s gruppfördelning inom varvet — `GROUP_SHARES` styr
vilka ord som *kommer ofta*, och det är precis vad en repetitionsplan tar över.
Den gamla vägen ligger kvar bakom `scope.ts` av samma skäl som vyerna gör det.

**5 — Panelen.** `settings` i dokumentet, `firstSeen`, panelen på startsidan,
budgeten som begränsar hur många nya ord varvet plockar.

Tester på formen `docs/plan.md` redan föreskriver: **invarianter, inte siffror**.
Ett test som låser `INTERVALS` till `[0,1,2,4,8,16,32]` låser fast gissningen och
är värdelöst. Ett test som säger att ett ord som svarats rätt men segt aldrig
flyttas upp en låda fångar att någon råkat ta bort tempovillkoret, och det är
hela grenens poäng.

Två invarianter till hör det tredje svaret, och båda är billiga att skriva:
ett «vet ej» får aldrig flytta ett ord längre ned än ett fel gör, och ett
«vet ej» får aldrig lämna ett spår i vare sig kanalens golv eller ordets farter.
Den första är ojämlikheten ovan uttryckt i kod, och den är den enda rad som
hindrar att gesten tyst blir en fälla nästa gång någon justerar trappan.

---

## Öppna frågor

### 1. Var kommer de nya orden ifrån när planen äger urvalet?

I dag väljer startsidan en vecka, och veckan *är* urvalsrymden. En
repetitionsplan med en daglig budget av nya ord vill i stället ha en kö som
korsar veckor: vecka 3:s ord ska kunna komma tillbaka samma dag som vecka 5:s
är nya.

Tre vägar, ingen självklar:

- **Veckan blir källan till nya ord**, och repetitionen tar allt som setts. Den
  som väljer vecka 5 säger «hämta nya ord härifrån», inte «öva bara det här».
  Minst ändring, och behåller det val en människa vet bättre än appen.
- **Katalogen blir kön**, veckoväljaren försvinner, nya ord tas i listordning.
  Renast, men tar bort det enda val `docs/plan.md` uttryckligen försvarar.
- **Veckan blir ett filter som går att stänga av.** Två sätt att använda appen,
  och därmed ett läge — vilket är precis vad appen inte har.

Jag lutar åt den första. Den bör ändå inte avgöras vid ett skrivbord.

### 2. Går «vet ej» att lita på när det är billigt?

*(Ersätter den gamla frågan «vad gör ett fel med lådan?», som det tredje svaret
avgjorde: fel till botten, «vet ej» en låda ned. Se «Priset måste räknas».)*

Kvar står den frågan räkningen inte kan svara på. Ojämlikheten
`C_vetej < ½ × C_fel` gör ärlighet till det *rationella* valet, men ett barn
optimerar inte en förväntad kostnad — det gör det som känns billigast i stunden,
och «vet ej» kan mycket väl kännas billigare än att tänka efter. Görs gesten
tillräckligt billig finns risken att den blir en väg *förbi* korten i stället för
ett svar på dem.

Vad som går att mäta: andelen «vet ej» per varv över tid. Faller den när orden
sätter sig gör gesten sitt jobb. Ligger den still runt en tredjedel oavsett hur
väl orden sitter, är det inte längre ett svar utan en knapp för att slippa.

Avgörs av att titta på ett barn i några veckor. Inte av resonemang, och inte av
att justera priset innan det finns något att titta på.

### 3. Räcker fyra kalibreringskort?

Två sanna och två falska ger en median av två per kanal, alltså ett medelvärde
av två tal. Det rullande fönstret räddar det över tid, men inte det första
varvet någonsin — och det är just då golvet behövs mest, eftersom ingenting
annat finns att jämföra med.

Alternativet är sex eller åtta kort, och då börjar varvet med en tredjedel
uppvärmning. Mät innan du gissar: kör tre varv och titta på hur mycket
medianerna rör sig mellan dem.

---

## Nya konstanter som är gissningar

Samma tabell som `docs/plan.md` har, för det som tillkommer här. Alla satta på
känsla.

| Konstant | Fil | Vad den styr |
| --- | --- | --- |
| `ROUND_WORDS` = 10 | `training/round.ts` | Hur många ord ett varv är |
| `CALIBRATION_CARDS` = 4 | `training/calibration.ts` | Hur många lätta ord som mäter golvet |
| `TEMPO_FACTOR` | `training/word-state.ts` | Hur mycket långsammare än golvet som fortfarande är «i tempo» |
| `INTERVALS` | `training/schedule.ts` | Trappan mellan lådorna, i dygn |
| `DEFAULT_NEW_PER_DAY` = 5 | `services/progress-store.ts` | Vad panelen står på innan någon rört den |
| `EASY_WORDS` | `training/calibration.ts` | Mätstickan för den som inte har egna behärskade ord än |
| `THRESHOLD_RATIO_Y` | `swipe-view/swipe-gesture.ts` | Hur långt ner kortet måste dras för «vet ej» |
| `VERDICT_UNSURE_MS` | `swipe-view/swipe-view.component.ts` | Hur länge facit står kvar när ingen visste |

`TRUE_SHARE`, `RECENT_MEMORY` och `MAX_SAMPLES` bärs över oförändrade från
`docs/plan.md`:s tabell och betyder samma sak här.
