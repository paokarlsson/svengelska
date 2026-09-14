# Plan

Arbetsanteckningar för glosträningen: vad som är avgjort, vad som är öppet, och
vad som är en gissning.

README beskriver vad appen *är*. Det här dokumentet beskriver vad den ska bli
och varför, och finns för att argumenten är lätta att glömma och dyra att
återupptäcka. Det ska ändras när något avgörs — en öppen fråga som besvaras
flyttar upp till «Avgjort», och en gissning som mätts stryks ur tabellen längst
ned.

Appen är byggd på `ganger`, som tränar multiplikationstabellen med samma
pedagogiska rörelse. Vad som lyftes därifrån, och vad som medvetet inte gjorde
det, står under «Arvet från ganger».

---

## Idén

Ett avgränsat block — tjugo glosor — förs genom fyra successivt mer krävande
steg. Varje steg tar bort ett stöd:

    Match → Sant/falskt → Återkalla → Skriva

Eller kognitivt:

> igenkänning med stöd → igenkänning → aktiv återkallning → fri produktion

Blocket är stabilt genom hela passet. Samma ord följer med genom alla fyra
stegen, **men varje ord rör sig i sin egen takt** — fjorton ord kan ha lämnat
Match medan sex är kvar, och för den som övar är det fortfarande ett block.

Principen under allt: **komplexitet under ytan, enkelhet på ytan.** Ingen
nivåväljare, ingen träningsplan, ingen statistik att tolka. Den centrala loopen
är `gör något → få omedelbar återkoppling → systemet uppdaterar sin bild →
nästa övning anpassas`.

---

## Avgjort

Det här är taget, och bör inte rivas upp utan att skälet nedan har fallit.

### En glosa identifieras av båda sidorna

Nyckeln är `en:dog=hund`, inte `en:dog`. `can = kan` och `can = burk` är två
glosor, inte en med två svar, och en nyckel på bara engelska hade gjort
framstegen på den ena till en lögn om den andra.

Priset är att en rättad översättning är ett nytt ord för systemet. Det är rätt
pris: ett stavfel i facit ska inte ärva framsteg som mättes mot något annat.

Prefixet `en:` är inte dekoration — `sv:hund=dog` ska kunna läggas till utan
att dokumentet görs om. Se öppen fråga 1.

### Tillståndet härleds, det lagras inte

Det finns inget fält som säger `state: "RECALL"`. Det finns bara måtten per
steg, och etiketten räknas fram vid visning (`word-state.ts`). Sparades båda
skulle de kunna glida isär, och då är frågan vilken som är sann.

Det är också vad som gör tillbakagång gratis: ett ord som tappar greppet om
`recall` hamnar där igen nästa gång funktionen körs, utan att någon skrivit en
nedflyttning.

### Igenkänning kan aldrig ensam nå «automatiserat»

Match och sant/falskt mäter att kopplingen känns igen, inte att den går att
plocka fram. `AUTOMATIC` kräver att `written` sitter, och regeln ligger i
`stateFor()` — inte i en förhoppning. Annars går det att matcha sig till en
grön karta utan att kunna producera ett enda ord.

Låst med ett test.

### Farten lagras som kvot mot stegets egen baslinje, aldrig som sekunder

Ett svep, ett återkallat svar och ett skrivet svar ligger på tre olika
tidsskalor. `ganger` lärde sig det två gånger på den hårda vägen: sekunder i ett
delat fält ger ett mått som jagar sin egen svans.

En kvot på 1,0 betyder «lika snabb som du brukar vara i det här steget», och
betyder samma sak i alla fyra stegen. Omräkningen sker på ett ställe,
`TrainingEngine.record()`, och baslinjen mäts **bara på rätta svar** — ett fel
är ofta ett långt grubbel, och att låta det höja baslinjen vore att låta
tröskeln sjunka varje gång det går dåligt.

### Hysteresen ligger i fönstret, inte i ett extra fält

En dom vilar på de fem senaste svaren: fyra rätt för att bli behärskad, två
missar i samma fönster för att sluta vara det. Uppåt och nedåt är alltså olika
trösklar, vilket är vad som gör att etiketten inte blinkar över gränsen — och
det kostar inget lagrat tillstånd, vilket en räcka-med-minne hade gjort.

Ett enstaka slarvfel tar inte ifrån ett ord dess behärskning. Ett tappat ord
klättrar inte tillbaka på ett enda rätt.

### Tillbakagång är ett urvalsbeslut, inte en tillståndsändring

Missar ett ord två gånger i rad i det pågående steget hämtas nästa exponering
från steget under (`trainingStep()`). Domen i det lägre steget rörs inte — ordet
är inte «nedflyttat», det får stöd. Konceptets formulering är att tillbakagång
inte är ett straff utan en del av repetitionslogiken, och skillnaden mellan att
ge stöd och att nollställa framsteg är precis den skillnaden.

### Tre lager, asynkront lager, versionerat dokument

    vy → TrainingEngine → ProgressRepository

En vy frågar motorn och räknar aldrig ut en tröskel själv. Motorn äger inga
rena regler; de ligger i moduler som går att pröva utan en spelare, var och en
på formen `gammalt tillstånd + händelse = nytt tillstånd`.

`ProgressRepository` är asynkront fast `localStorage` inte är det: ett löfte går
att uppfylla synkront, men en synkron signatur går inte att göra asynkron i
efterhand utan att varje anropare skrivs om. Dokumentet bär `schemaVersion`
från första versionen — `ganger` fick lära sig att känna igen sin version 1 på
formen av dess nycklar, och det kostar noll att slippa.

### Ord har ingen rank

Det här är den stora skillnaden mot `ganger`, och den är värd att skriva ned så
att ingen «lägger till svårighetsgrad» i tron att det saknas.

I `ganger` härleds hela svårighetsordningen ur en enda array, eftersom 7 × 8
*är* svårare än 2 × 3 av skäl som går att räkna ut. Ord har ingen sådan
inneboende ordning: att `beautiful` är svårare än `cat` är en mätning, inte en
härledning.

Konsekvensen är att hela nivåapparaten utgår — `focusRank`, `windowWeight`,
nivåknappar, svårighetsgrupper. Blocket *är* urvalsrymden, och steget per ord
ersätter nivån. Det är en förenkling, inte en förlust.

### Läget är motorns beslut, inte användarens

Det finns ingen meny som väljer övning. Konceptets produktprincip är att
användaren inte ska behöva välja nivå eller planera sin träning, och en
lägesmeny hade varit första steget bort från den. `ganger`:s egen plan går åt
samma håll (dess steg 6, «ta bort nivåknapparna»).

---

## Öppna frågor

### 1. Åt vilket håll översätts det?

I dag är `en` frågan och `sv` facit. Men `hund → dog` är en annan färdighet än
`dog → hund`, och den svårare av de två.

Tre vägar: bara en riktning, båda blandat i samma mått, eller båda som skilda
kanaler i samma ord. Den sista är dyrast och sannast, och nyckelprefixet är
redan format för den (`en:` / `sv:`).

Avgörs av: vad som faktiskt ska tränas. Det är ett produktbeslut, inte en
mätning. Att välja *nu* är billigare än senare — ett tillagt håll är en ny
kanal i dokumentet.

### 2. Vad betyder «nästan rätt»?

Konceptet säger uttryckligen att betydelsen kan sitta medan stavningen inte gör
det, och det kräver en tredje utfallskategori som `ganger` inte har någon
motsvarighet till — där är ett svar rätt eller fel.

Frågan är inte hur nära miss *upptäcks* (Levenshtein ≤ 1 duger), utan vad den
ska betyda:

- räknas som rätt för betydelsen och fel för stavningen — två mått per ord?
- räknas som rätt, men ordet får komma igen snart?
- räknas som fel, med en vänligare återkoppling?

Det första är sannast och kräver ett fält till i `written`. Det andra är
billigast. Ta ställning innan `spelling.ts` skrivs, inte under.

Samma fråga gäller `also`-formerna: `hunden` för `hund` är inte ett stavfel utan
en annan form, och det är inte självklart att det ska vägas likadant.

### 3. Räcker blocket som distraktorkälla?

Konceptet säger att felaktiga översättningar helst ska hämtas ur samma block
eller samma semantiska område. Blocket är gratis och pedagogiskt rätt.

Risken är att blocket lärs som *mängd*: med tjugo ord där alla felsvar kommer ur
samma tjugo går det att svara rätt på `dog = katt` genom att veta att `katt` hör
till `cat`, utan att veta vad `dog` betyder. Uteslutning är en riktig strategi
och delvis vad steg 1 ska mäta — men den ska inte överleva till steg 2.

Möjlig motvikt: låt en minoritet av felsvaren komma utifrån blocket. `ganger`
håller sin motsvarande andel (`NEAR_NUMBER_WEIGHT`) konstant på 15 % på alla
nivåer, och andelen är där mätt ur referensdata. Här finns ingen referensdata.

### 4. Var kommer orden ifrån?

`SEED_BLOCK` finns för att det ska gå att öva alls. Konceptet säger ingenting om
innehållet, och det är den största produktytan som saknas:

- skrivs listor in i appen, klistras de in, eller importeras de?
- vem delar upp en lista i block om tjugo — användaren eller systemet?
- ska ett block kunna blandas om mellan pass, eller är det stabilt för alltid?

Blocket ska vara stabilt under ett pass. Om det ska vara stabilt *mellan* pass
är en annan fråga, och den avgör om «blocket» är ett objekt som lagras eller en
vy över en längre lista.

### 5. Hur lång är pausen före facit i steg 3?

«Efter en kort stund visas facit» — men en fast fördröjning straffar den snabba
och stressar den långsamma, och en knapptryckning gör steget till två
interaktioner i stället för en.

Ett tredje alternativ: visa facit när fingret börjar röra sig. Då mäts
återkallningstiden på det som faktiskt hände, och tempot behålls.

Avgörs av: att pröva det på en surfplatta. Inte av resonemang.

### 6. När är ett block klart?

Alla tjugo orden automatiserade är ett hårt krav — några ord kommer att släpa,
och konceptet säger att blocket ska kunna avslutas med en tydlig känsla av att
något är genomarbetat.

Trolig form: blocket är klart när de flesta orden nått `written`, och de som
släpar följer med in i nästa block i stället för att hålla kvar det. Då blir
«svåra ord återkommer oftare» något systemet gör åt användaren, vilket är
poängen.

### 7. Ska Match vara diagnostisk här?

`ganger` håller Para ihops urval slumpmässigt för att kunna mäta om
matchningstider säger något om samma fakta i svep — och konstaterar att i samma
stund spelet väljer efter vad det redan tror blir loggen ett eko av den tron.

Samma fråga finns här, med samma fönster som stänger sig självt. Skillnaden är
att `ganger` har 55 fakta och en obiaserad ordning att mäta mot; ett block om
tjugo ger tunnare underlag.

Beslut: bygg ingen observationslogg förrän frågan faktiskt ska besvaras. Att
kopiera loggen «för säkerhets skull» ger data ingen läser.

---

## Kvarvarande steg

Ordningen är vald så att varje steg går att pröva när det är klart.

### Steg 1 — rättningen ✱ näst på tur

`training/spelling.ts`: jämför ett skrivet svar mot `acceptedAnswers()`, och
svara rätt / nästan / fel. Kräver att öppen fråga 2 avgjorts först.

### Steg 2 — urvalet inom blocket

`words/word-selector.ts`: dra nästa ord ur blocket för ett givet steg. Vikterna
finns redan (`needFor`), och färskhetsspärren är värd att lyfta från `ganger`s
`RECENT_MEMORY` — ett svårt ord ska komma tillbaka efter några andra ord, inte
omedelbart.

Konceptets 60–70 / 20–30 / 10–15 är en fördelning, och `ganger`s plan påpekar
att **med multiplicerade vikter går det inte att ange en andel, bara hoppas på
den**. Vill man ha en fördelning måste urvalet ske i två steg: dra grupp först,
dra ord inom grupp sedan. Då blir fördelningen ett tal som går att testa.

### Steg 3 — sessionsdirigenten

Det som gör de fyra vyerna till ett pass: håller blocket, frågar motorn vilket
steg nästa ord ska visas i, och byter vy därefter. Det är här appen skiljer sig
mest från `ganger`, som har tre spel i en meny.

### Steg 4 — de fyra vyerna

Portas från `ganger` i den här ordningen, för att varje port är billigare än den
föregående:

| Vy | Källa | Vad som ändras |
| --- | --- | --- |
| Sant/falskt | `swipe-view/` | kortets text och distraktorn; gest, brasa och rond är oförändrade |
| Återkalla | `swipe-view/` igen | samma komponent, tvåstegskort, domaren är användaren själv |
| Match | `match-view/` | `Fact` blir `WordPair`; rondbygget och den deranged shuffle:n bär |
| Skriva | `master-view/` | timer och rondflöde bär; nivåapparaten följer inte med |

### Steg 5 — kartan

Inte `ganger`s triangel — den formen finns bara för att 7 × 8 och 8 × 7 är samma
tal. Här är det en lista med ett fält per steg, alltså precis den tabell
konceptet skissar:

    dog → hund    match: sitter  sant/falskt: sitter  återkalla: övar  skriva: svag

`services/time-color.ts` och regeln att färgen alltid mäts mot *stegets egen*
tröskel bärs över oförändrade.

### Steg 6 — ordlistor in

Se öppen fråga 4. Sist, eftersom allt annat går att pröva på `SEED_BLOCK`.

### Steg 7 — mät konstanterna

Alla siffror i tabellen nedan är gissningar. `ganger`s plan argumenterar utförligt
för att en simuleringsrigg är fel verktyg när användarbasen är ett par barn vid
ett köksbord som går att titta på medan de spelar, och det argumentet gäller
oförändrat här.

Vad som ska testas är **invarianter, inte siffror**: ett test som låser `WINDOW`
till 5 låser fast gissningen och är värdelöst; ett test som säger att
lyckandegraden inte får falla under 75 % över ett pass fångar att någon gjort
träningen till ett förhör.

---

## Konstanter som är gissningar

Satta på känsla, inte ur mätdata. Markerade `ANTAGANDE:` i koden.

| Konstant | Fil | Vad den styr |
| --- | --- | --- |
| `WINDOW`, `MASTERED_HITS`, `LEARNING_HITS` | `training/word-state.ts` | Hur trögt en dom rör sig, och hysteresen |
| `MIN_ATTEMPTS` | `training/word-state.ts` | Hur många svar som krävs för en dom alls |
| `MASTERED_PACE` | `training/word-state.ts` | Hur snabbt ett behärskat ord måste vara |
| `FALLBACK_MISSES` | `training/word-state.ts` | När ett ord får stöd av steget under |
| `NEED_FLOOR` / `NEED_CEILING` | `training/word-state.ts` | Hur sällan ett behärskat ord ändå kommer |
| `DEFAULT_BASELINE` | `services/progress-store.ts` | Farten varje steg antas ha innan den mätts |
| `BASELINE_WINDOW`, `MIN_BASELINE_SAMPLES` | `services/progress-store.ts` | Hur snabbt baslinjen följer spelaren |
| `MIN_SAMPLE` / `MAX_SAMPLE` | `training/training-engine.ts` | Vad som räknas som ett tappat kort |
| `BLOCK_SIZE` | `words/word-catalog.ts` | Blockets storlek |

---

## Arvet från ganger

Vad som lyftes, och vad som inte gjorde det. Skrivet för att frågan «kan vi inte
bara återanvända X?» kommer tillbaka.

**Kopierat i stort sett orört:** `src/styles/` med hela designsystemet, riggen
(`angular.json`, tsconfig, Vitest, Docker, Pages-arbetsflödet), och mönstret i
`progress-store.ts` — repository-gränssnittet, `normalize()` mot ett redigerat
dokument, och att varje `localStorage`-fel sväljs där och ingen annanstans.

**Bärs över som resonemang, inte som kod:** treskiktningen, `needWeight`:s form
med sitt golv, färskhetsspärren, och de fyra besluten under «Avgjort» som är
märkta med att `ganger` lärde sig dem först.

**Följer medvetet inte med:** `fact-catalog.ts` och hela svårighetshärledningen,
`fact-selector.ts`:s nivåfönster, `distractors.ts`:s aritmetiska felsvar,
`levels.ts`, `auto-difficulty.ts` och den triangulära värmekartan. Alla fyra har
sitt svar i tabellens struktur, och den strukturen finns inte i ordpar.

**Fällan:** `training-engine.ts` i `ganger` ser ut att vara den mest värdefulla
filen att kopiera, men dess importrader drar in hela nivåapparaten. Den ska
läsas, inte kopieras. Det som bar över var dess *regel* — en vy frågar motorn
och räknar aldrig ut en tröskel själv — och den ryms på en rad.
