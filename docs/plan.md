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

Ett avgränsat block — veckans glosor — förs genom fyra successivt mer krävande
steg. Varje steg tar bort ett stöd:

    Match → Sant/falskt → Återkalla → Skriva

Eller kognitivt:

> igenkänning med stöd → igenkänning → aktiv återkallning → fri produktion

Blocket är stabilt genom hela passet. Samma ord följer med genom alla fyra
stegen, **men varje ord rör sig i sin egen takt** — sju ord kan ha lämnat Match
medan tre är kvar, och för den som övar är det fortfarande ett block.

**Stegen är en stege, inte en kö.** Ordningen säger vad som är svårare, inte var
alla måste börja. Den som redan gått igenom veckans lista i skolan ska kunna
kliva rakt in i svepet, och ska inte behöva para ihop tio ord hen känner igen
för att få göra det. Därför väljs *ingången* på startsidan — var passet kliver
in — medan stegen därefter är motorns.

Ingången är ett golv och inte ett läge. Ett ord som sitter puttas vidare uppåt
av sin egen mätning, och ett ord som kämpar får stöd från steget under — också
när det steget ligger under golvet. Rörelsen uppåt sker mellan pass och nedåt
mitt i ett; varför den asymmetrin finns står under «Uppflyttningen sker mellan
pass».

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

### Ett överhoppat steg räknas som klart när ett svårare sitter

Spegelbilden av regeln ovan, och nödvändig i samma stund ingången går att välja.
Kliver passet in i Återkalla mäts match aldrig, och `currentStep()` — «första
steget som inte sitter» — skulle då peka på match för alltid. Följden vore att
inget ord i veckan någonsin blev automatiserat, att kartans första kolumn stod
grå hur mycket som än övades, och att blocket aldrig kunde bli klart. Ett val på
startsidan hade tyst gjort framstegen omöjliga.

Regeln är därför att ett steg är avklarat när det självt sitter **eller** när
något svårare sitter (`settled()`). Fri produktion bevisar igenkänning;
igenkänning bevisar aldrig produktion. Den ena riktningen är gratis och den andra
utesluten, och det är samma asymmetri som `stateFor()` redan vilar på — bara läst
åt andra hållet.

För ett ord som gått stegen i ordning ändrar regeln ingenting: har det nått
Skriva sitter allt under ändå. Den nya grenen kan bara falla ut för ett ord som
hoppat över något, vilket är precis vad den finns för. Kartan säger «räcker» och
inte «sitter» om ett sådant fält, eftersom skillnaden mellan *mätt* och *täckt*
är värd ett ord.

### Skriva förtjänas, de tre andra är öppna

Match, sant/falskt och återkalla går att välja för en vecka som aldrig rörts:
alla tre går att ta sig igenom med ett ord man aldrig sett, och ett fel där
kostar ingenting. Att skriva ett ord man aldrig sett är ingen övning utan en
gissning på en tom rad, och den enda återkoppling den kan ge är «fel».

Därför visas Skriva från början men går inte att välja förrän minst ett ord i
veckan tagit sig fram till steget av egen kraft. Låst och synlig, inte gömd — det
som ska komma ska synas, annars ser stegen ut att vara tre. Villkoret är
avsiktligt *ett* ord och inte alla: ingången är ett golv, och ett golv som kräver
att alla redan står på det är inget golv.

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

### Ingången är användarens, stegen är motorns

Startsidan har fyra ingångar och ingen av dem är ett läge. Skillnaden är hela
beslutet och lätt att tappa: ett läge gäller passet ut och gör den som övar till
sin egen planerare, medan en ingång gäller det *första* kortet och lämnar resten
till mätningen. Väljs Återkalla dyker sant/falskt upp ändå för det ord som inte
når fram, och det ord som sitter går vidare till Skriva utan att någon bett om
det.

Skälet att lämna ingången till användaren är att den inte är en mätning. Vilket
steg ett *enskilt ord* ska övas i vet bara systemet, och det ska ingen människa
behöva räkna ut. Men var *veckan* börjar vet den som övar bättre än appen: att
listan redan gåtts igenom på måndagen står inte i framstegsdokumentet. Att tvinga
den som känner igen orden genom en match-runda för att få svepa är att låta en
tom mätning bestämma över ett känt faktum.

Svepet är default, och det är inget hopp: det är appens centrum, och en app ska
öppna i det den är. Match står kvar som den enklare vägen in, inte som början.
`ganger`:s steg 6 — «ta bort nivåknapparna» — pekar fortfarande åt samma håll,
och det är därför det här *inte* är en nivåväljare: det finns ingen
svårighetsgrad att ställa in, bara en dörr att gå in genom.

### Uppflyttningen sker mellan pass, nedflyttningen mitt i ett

Ett *orört* ord hinner aldrig förbi sin ingång inom ett och samma pass, och det
följer av fyra konstanter som var och en är satt av andra skäl:

| Konstant | Värde | Vad den gör här |
| --- | --- | --- |
| `RECENT_MEMORY` | 4 | Spärrar ordet i fyra drag, så det kan komma tidigast vart femte |
| `MIN_ATTEMPTS` | 4 | Fyra svar innan steget alls får dömas |
| `MASTERED_HITS` | 4 | Fyra rätt i fönstret för att steget ska sitta |
| `SESSION_LENGTH` | 20 | Så många svar passet är |

Ett ord som kommer på drag 1 kommer sedan tidigast på 6, 11 och 16. Det fjärde
svaret är alltså det som gör steget behärskat, och det *femte* draget — där
ordet skulle visas i nästa steg — infaller tidigast på drag 21. Passet är slut
vid 20. Ett orört block får därför aldrig se ett ord flytta upp under passets
gång, och med tio ord i en riktig vecka är marginalen större än så.

Det är ingen brist, utan vad siffrorna säger tillsammans: att bli behärskad *ska*
kosta fyra svar spridda över tid, och att inte nöta samma glosa i rad är hela
skälet till spärren. Uppflyttningen är det andra passets sak, och för ett ord som
redan kommit en bit är den omedelbar — golvet sänker aldrig den som kommit
längre.

Nedflyttningen är osymmetrisk och ska vara det: stödet i `trainingStep()` kräver
bara `FALLBACK_MISSES` = 2 missar i rad, så ett ord som kämpar får hjälp redan i
samma pass. Det är avsiktligt. Att få stöd för sent är att fastna; att flyttas
upp för sent är bara att vänta till i morgon.

Vad som skulle ändra det är `MASTERED_HITS`, inte ingången — och `MIN_ATTEMPTS`
med den, eftersom fyra rätt kräver fyra svar oavsett vad den står på. Krävdes
tre rätt i stället för fyra sitter steget på drag 11 och ordet visas i nästa på
drag 16, alltså inom passet. Om det är rätt är en av sakerna som ska mätas och
inte resoneras fram — se «Steg 8 — mät konstanterna».

`session.spec.ts` prövar därför golvet på ett ord som nötte klart sitt steg i ett
*tidigare* pass. Ett test som väntade sig uppflyttning inom passet prövade inte
regeln utan aritmetiken ovan, och kunde aldrig bli grönt.

### Riktningen är en: engelska frågar, svenskan svarar

Öppen fråga 1, avgjord åt det billigaste hållet — men medvetet, inte av
tröghet. `hund → dog` är en annan färdighet än `dog → hund` och den svårare av
de två, och att träna båda i samma mått hade gjort måttet till ett medelvärde
av två saker.

Därför: **en riktning i taget.** Nyckelprefixet (`en:`) och listans
`distractorsEn` ligger kvar och är oanvända, och det är hela förberedelsen som
behövs — den dagen `sv:hund=dog` ska tränas är det en ny kanal i dokumentet och
inga omskrivna anropare.

### «Nästan rätt» räknas som fel i domen, men aldrig som ett fel i tonen

Öppen fråga 2, avgjord åt det tredje alternativet: ett svar som ligger ett
tecken från facit räknas som **fel**, får en egen återkoppling — «Nästan — det
stavas *syster*» — och kommer tillbaka i samma pass.

Skälet är att skrivsteget är det enda som mäter stavning. Räknades ett felstavat
svar som rätt skulle ett ord kunna nå «automatiserat» utan att någon gång ha
stavats rätt, och det är precis den lögn README lovar att appen inte berättar.
Att i stället skilja på betydelse och stavning *i domen* kräver ett fält till
per ord, och det fältet finns det ingen som läser än.

Ombytta grannar räknas som ett fel och inte två (`hudn` ligger ett steg från
`hund`): två fingrar i fel ordning är den vanligaste felskrivningen av ett ord
man faktiskt kan. Korta ord — under fyra tecken — bedöms aldrig som nästan, för
där ligger grannarna för tätt: `ko` och `ku` är inte en slarvig stavning utan
ett annat ord.

### Felsvaren står i listan, inte i koden

Öppen fråga 3, avgjord av innehållet: varje glosa bär sina egna felsvar
(`distractorsSv`), skrivna av den som kan orden. Risken frågan pekade ut —
att blocket lärs som *mängd*, så att `dog = katt` går att avfärda för att
`katt` hör till `cat` — finns bara när felsvaren dras ur samma tio ord. Ett
skrivet felsvar får komma från veckans tema i stort.

Blocket är kvar som *fallback*, så att en lista med bara två kolumner går att
öva på. Någon andel utifrån blocket att hålla konstant (`ganger`:s
`NEAR_NUMBER_WEIGHT`) finns därmed inte: här är det listans författare som
avgör, vilket är både billigare och sannare än en siffra ingen mätt.

### Listan är data, och ett block är listans egen grupp

Öppen fråga 4, avgjord så långt den behövde avgöras för att appen ska gå att
öva i. Orden ligger i `data/glosor.csv` — en rad per glosa, en kolumn för
veckan — och `npm run words` gör om dem till `src/app/words/word-lists.json`,
som appen läser.

Tre följder är värda att skriva ned:

- **Ett block är en vecka, inte tjugo ord.** `BLOCK_SIZE` är borta. Den som
  skriver listan grupperar den, eftersom det är hen som vet vad veckan
  innehåller; systemet ska inte dela en lista i bitar efter en siffra som var
  en gissning från början.
- **Blocket är stabilt mellan pass**, inte bara under ett. Det är ett objekt i
  listan och inte en vy över något längre.
- **Nyckeln bär inte blocket.** `water = vatten` står i både Mat och
  Vardagsord och är samma glosa; framstegen följer ordet, inte listan det råkade
  stå i.

Vad som *inte* är avgjort är hur listor kommer in utan en textredigerare och en
terminal. Se steg 6.

### Facit i steg 3 visas när fingret rör kortet

Öppen fråga 5, avgjord åt det tredje alternativet. En fast fördröjning straffar
den snabba och stressar den långsamma; en extra knapp gör steget till två
interaktioner i stället för en. Rör sig fingret har återkallningen redan hänt,
och det är den tiden som mäts — inte tiden det tar att därefter trycka på «jag
kunde det», som bara säger något om tummen.

Knappen «Visa facit» finns ändå, för den som sitter vid ett tangentbord. Den
gör exakt samma sak.

### Ett färdigt ord lämnar inte urvalet

`needFor` har ett golv för att ett behärskat ord ska komma sällan men aldrig
aldrig. Det golvet vore verkningslöst om ett ord som klarat alla fyra steg föll
ur urvalsrymden, och det är precis vad som händer om «har ett nästa steg» får
betyda «ska visas». Därför underhålls ett automatiserat ord i sitt sista steg,
och utgör urvalets tredje grupp.

*När ett pass är slut* är dirigentens fråga och inte urvalets. Att blanda ihop
de två är hur ett färdigt ord tyst försvinner ur systemet — och då märks det
aldrig när det rostat.

---

## Öppna frågor

Fråga 1–5 är avgjorda och står under «Avgjort». Kvar står de två som inte gick
att avgöra vid ett skrivbord.

### 1. När är ett block klart — och vad händer med orden som släpar?

*(Tidigare fråga 6. Halvt avgjord.)*

Det som är byggt: ett **pass** är slut efter tjugo svar, och ett **block** är
klart när varje ord i det sitter hela vägen ut. Sammanfattningen säger vilka ord
som tog ett steg, och kartan visar resten.

Det som inte är byggt är konceptets andra halva: att de ord som släpar ska följa
med in i nästa block i stället för att hålla kvar det. I dag är blocken
oberoende, och ett ord som fastnar fastnar i sin vecka. Att låta det följa med
är inte svårt — nyckeln bär inte blocket, så samma glosa i två listor är redan
samma framsteg — men det kräver ett svar på vad «nästa block» är när listorna är
veckor och veckan efter har sina egna tio ord.

Frågan har sedan ingången blev valbar också en andra dimension: ett block som
körts från svep-ingången blir klart på färre mätningar än ett som gått hela
stegen, eftersom ett överhoppat steg räknas som täckt. Om det är rätt — om
«klart» ska betyda samma sak oavsett var veckan började — avgörs av samma sak
som resten av frågan.

Avgörs av: att se ett barn använda appen i några veckor. Inte av resonemang.

### 2. Ska Match vara diagnostisk här?

`ganger` håller Para ihops urval slumpmässigt för att kunna mäta om
matchningstider säger något om samma fakta i svep — och konstaterar att i samma
stund spelet väljer efter vad det redan tror blir loggen ett eko av den tron.

Samma fråga finns här, med samma fönster som stänger sig självt: Match-rundan
fylls efter `needFor`, alltså efter vad appen redan tror. Skillnaden är att
`ganger` har 55 fakta och en obiaserad ordning att mäta mot; ett block om tio
ger tunnare underlag.

Beslut: bygg ingen observationslogg förrän frågan faktiskt ska besvaras. Att
kopiera loggen «för säkerhets skull» ger data ingen läser.

---

## Kvarvarande steg

Steg 1–5 i den ursprungliga planen är byggda: rättningen (`training/spelling.ts`),
urvalet (`words/word-selector.ts`), sessionsdirigenten (`training/session.ts`),
de fyra vyerna och kartan. Vad som ändrades på vägen står under «Avgjort».

Två saker ur den listan blev inte som planerat, och det är värt en rad var:

**Kartan blev ingen värmekarta, och `services/time-color.ts` skrevs aldrig.**
Regeln den skulle bära — att färgen alltid mäts mot *stegets egen* tröskel —
kommer gratis, eftersom `masteryIn()` dömer på kvoter mot stegets baslinje och
inte på sekunder. Kartan visar därför fyra fält per ord med sin dom i klartext
(sitter, övar, svag, ny), och färgen är domens och inte en ramp. En ramp hade
krävt en skala att läsa, och det är precis vad «ingen statistik att tolka»
utesluter.

**Sant/falskt och Återkalla blev en komponent och inte två.** Samma kort, samma
gest, samma återkoppling; det enda som skiljer är vem som dömer och vad tiden
mäter. Planen gissade det, och gissningen höll.

### Steg 6 — ordlistor in, utan terminal

`data/glosor.csv` plus `npm run words` löser innehållet för den som har repot.
Det löser det inte för den som bara har appen. Vad som saknas är en väg in i
webbläsaren: klistra in en lista, eller läsa en CSV-fil.

Formen är redan förberedd — `parseBlocks()` tar emot vad som helst och gör det
den kan av det, precis som `normalize()` i `progress-store.ts` gör med ett
redigerat dokument. Det som fattas är en yta och ett beslut om var en inklistrad
lista *bor*: i framstegsdokumentet, eller under en egen nyckel med en egen
version.

### Steg 7 — den andra riktningen

`sv:hund=dog` som en egen kanal. Se «Riktningen är en» under «Avgjort» för vad
som redan ligger på plats, och `distractorsEn` i listorna för felsvaren som
väntar på den.

Gör det inte förrän någon faktiskt vill träna det hållet.

### Steg 8 — mät konstanterna

Alla siffror i tabellen nedan är gissningar. `ganger`:s plan argumenterar utförligt
för att en simuleringsrigg är fel verktyg när användarbasen är ett par barn vid
ett köksbord som går att titta på medan de spelar, och det argumentet gäller
oförändrat här.

Vad som ska testas är **invarianter, inte siffror**: ett test som låser `WINDOW`
till 5 låser fast gissningen och är värdelöst; ett test som säger att
lyckandegraden inte får falla under 75 % över ett pass fångar att någon gjort
träningen till ett förhör.

Två invarianter finns redan, och båda är värda att behålla formen på:
fördelningen mellan urvalsgrupperna mäts som ett spann och inte som ett tal
(`word-selector.spec.ts`), och att samma ord aldrig kommer två gånger i rad
mäts över ett helt pass (`session.spec.ts`).

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
| `NEAR_DISTANCE`, `MIN_NEAR_LENGTH` | `training/spelling.ts` | Var gränsen går mellan «nästan» och «ett annat ord» |
| `DEFAULT_ENTRY` | `training/entry.ts` | Vilken ingång startsidan öppnar i |
| `SESSION_LENGTH` | `training/session.ts` | Hur långt ett pass är |
| `MATCH_ROUND` | `training/session.ts` | Hur många par en match-runda visar |
| `RECENT_MEMORY` | `words/word-selector.ts` | Hur länge ett nyss övat ord är spärrat |
| `GROUP_SHARES` | `words/word-selector.ts` | Fördelningen svaga / på gång / underhåll |
| `TRUE_SHARE` | `words/distractors.ts` | Hur ofta ett påstående i steg 2 är sant |
| `DEFAULT_BASELINE` | `services/progress-store.ts` | Farten varje steg antas ha innan den mätts |
| `BASELINE_WINDOW`, `MIN_BASELINE_SAMPLES` | `services/progress-store.ts` | Hur snabbt baslinjen följer spelaren |
| `MIN_SAMPLE` / `MAX_SAMPLE` | `training/training-engine.ts` | Vad som räknas som ett tappat kort |

Tiderna i vyerna — hur länge en återkoppling står kvar, hur långt ett svep måste
dras — är också gissningar, men av ett annat slag: de avgörs av att hålla i en
surfplatta, inte av mätdata, och står därför inte här.

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

Det gäller även vyerna, fast planen kallade dem portar. Match-rundan och den
deranged shuffle:n är skrivna här och inte kopierade: rondbygget är samma idé,
men innehållet är ord och inte tal.

**Svepet är undantaget, och det är ett medvetet byte.** Kortet skrevs först
här — en egen rektangel med en egen dragning — och det var fel slags
originalitet: gesten är inte innehåll. Nu är utseendet och svepmekaniken
`ganger`:s, tagna rakt av. Kvadratiskt kort i kortfärgen, lutning mot draget,
stämpel för svaret draget är på väg att ge, och ett kort som far ut ur bild åt
det hållet. Tröskeln skalar med skärmens bredd och en knyck godtas även när den
är kort. Måtten är mätta lika i båda apparna: samma kortstorlek, samma
rotationsmatris, samma stämpelopacitet vid samma drag.

Vad som *inte* följde med är vad kortet säger. `dog = hund` har inget gemensamt
med `7 × 8 = 54` utom att det svepas, och Återkalla — där facit visas först och
den som övar dömer sig själv — finns inte i `ganger` alls. Knapparna under
kortet står därför kvar, där `ganger` gömmer sina: «jag kunde det» är ett
påstående man ska kunna trycka på.

Två saker är skrivna här som `ganger` inte har. `swipe-gesture.ts` är
trösklarna utbrutna ur vyn, för att en regel ska gå att pröva utan en skärm —
`ganger` har samma tal inbakade i sin komponent och därför inget test på dem.
Och klippet i sidled ligger i skalet (`app.component.scss`): `ganger` slipper
frågan genom att dess skal är exakt en ruta stort, medan den här sidan rullar.

Vad som därutöver bars över oförändrat är `src/styles/`, och det syns: varje
`ui-`-klass i mallarna kommer därifrån. Sedan svepet flyttade hem bor även
`--card-size` där, eftersom passets scen måste reservera kortets höjd för att
sidan inte ska hoppa mellan stegen.

Startsidans ingångsval är `.ui-toggle`, alltså exakt samma knapp som `ganger`:s
nivåval. Det är värt en rad just för att formen är densamma och betydelsen inte:
där ställs en svårighetsgrad in, här öppnas en dörr. Att den likheten är synlig
gör det lättare att av misstag bygga tillbaka nivåväljaren, och det är därför
skälet står skrivet både här och i `entry.ts`.

**Följer medvetet inte med:** `fact-catalog.ts` och hela svårighetshärledningen,
`fact-selector.ts`:s nivåfönster, `distractors.ts`:s aritmetiska felsvar,
`levels.ts`, `auto-difficulty.ts` och den triangulära värmekartan. Alla fyra har
sitt svar i tabellens struktur, och den strukturen finns inte i ordpar.

**Fällan:** `training-engine.ts` i `ganger` ser ut att vara den mest värdefulla
filen att kopiera, men dess importrader drar in hela nivåapparaten. Den ska
läsas, inte kopieras. Det som bar över var dess *regel* — en vy frågar motorn
och räknar aldrig ut en tröskel själv — och den ryms på en rad.
