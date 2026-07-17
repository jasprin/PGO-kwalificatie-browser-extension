# Plan: Browserextensie voor MedMij-kwalificatie (systeemrol Raadplegen)

Status: **concept — requirements in opbouw**
Laatst bijgewerkt: 2026-07-17

Dit document is de single source of truth voor requirements, flow en scope van de
extensie. Wordt gedurende het project bijgehouden en uitgebreid.

---

## 1. Achtergrond

### 1.1 Wat is een PGO?

Een Persoonlijke Gezondheidsomgeving (PGO) is een app of website waarmee een burger
gratis en veilig een kopie van zijn/haar medische gegevens van verschillende
zorgverleners op één plek kan verzamelen en inzien (huisarts, ziekenhuis, GGZ, etc.).
Een PGO is géén patiëntenportaal van één zorgaanbieder, maar consolideert gegevens
over meerdere bronnen heen. Veiligheid en gegevensuitwisseling verlopen via het
**MedMij Afsprakenstelsel**, beheerd door Stichting MedMij. Alleen PGO's en
zorgaanbieders die het MedMij-keurmerk hebben (d.w.z. gekwalificeerd zijn) mogen
via dit stelsel gegevens uitwisselen.

Relevante partijen/rollen:

- **PGO-leverancier / DVP** (Dienstverlener Persoonsdomein) — bouwt en levert de PGO.
- **Zorgaanbieder / XIS-leverancier / DVA** (Dienstverlener Zorgaanbiedersdomein) —
  levert het bronsysteem (XIS) waar gegevens vandaan komen.
- **Nictiz** — voert de kwalificatie inhoudelijk uit (informatiestandaarden).
- **MedMij (Stichting MedMij)** — beheert het Afsprakenstelsel en de erkenning/label.

### 1.2 Wat is kwalificatie?

Voordat een PGO (of XIS) gegevens mag uitwisselen binnen het MedMij-stelsel, moet
de leverancier per **gegevensdienst** (bv. LSP-Basisgegevenszorg, BGZ, Zelfmetingen,
etc.) en per **systeemrol** aantonen dat de implementatie conform de
informatiestandaard werkt. Dit heet kwalificeren. Er zijn vier systeemrollen:

| Systeemrol | Domein | Betekenis |
| --- | --- | --- |
| **Raadplegen** | Persoonsdomein (PGO) | PGO haalt gegevens op bij een zorgaanbieder (XIS) |
| Sturen | Persoonsdomein (PGO) | PGO stuurt gegevens naar een zorgaanbieder |
| Beschikbaarstellen | Zorgaanbiedersdomein (XIS) | XIS stelt gegevens beschikbaar aan een PGO |
| Ontvangen | Zorgaanbiedersdomein (XIS) | XIS ontvangt gegevens van een PGO |

**Onze extensie richt zich op de systeemrol "Raadplegen"** — dus op PGO-leveranciers
die gegevens ophalen bij zorgaanbieders.

### 1.3 Het kwalificatietraject (Raadplegen) — samenvatting

Bron: MedMij:Kwalificatie:V1/Kwalificatie (Nictiz wiki)

**Algemene voorwaarden (voordat je mag starten):**

1. Kennis/begrip van het MedMij Afsprakenstelsel.
2. Kennis van de gebruikte infrastructuur en netwerk-authenticatie.
3. Kennis/begrip van de betreffende MedMij-informatiestandaard.
4. Vermogen om tabellen, waardelijsten en referenties correct toe te passen.
5. Kennis van en naleving van de aandachtspunten uit de kwalificatiedocumentatie.
6. Alle ingevoerde deelnemersgegevens moeten correct zijn (fouten vertragen het proces).
7. Inhoudelijke informatie uit de informatiestandaard moet **altijd zichtbaar zijn
   voor de eindgebruiker** — aan te tonen met schermafdrukken van de PGO-interface.
8. Kwalificatie toetst **geen** infrastructurele eisen.

**Procedurele eisen:**

- Conformiteitscheck (CC)-formulier: verplicht indien van toepassing, **minimaal 4
  weken van tevoren** aanleveren; niet op tijd = kwalificatiemoment vervalt.
- Afwijkingen t.o.v. andere/eerdere gegevensdiensten: minimaal 2 weken van tevoren melden.
- Het systeem dat gekwalificeerd wordt moet met **gelijke functionaliteit** ook
  daadwerkelijk (later) in productie gaan.
- Testuitvoering moet **100% succesvol** zijn vóórdat de formele kwalificatie start.
- Testscripts mogen **niet ouder dan 1 week** zijn op moment van aanleveren.
- De "T-datum" (referentiedatum voor datumberekeningen in testdata) moet overeenkomen
  met de testrun-datum in Conformancelab.
- Schermafdrukken moeten exact corresponderen met de ingediende Conformancelab-resultaten.
- Juiste aanleverformat per rol: **DVP levert screenshots van de PGO-interface**
  (DVA levert screenshots van het bronsysteem).

**Inhoudelijke eisen specifiek aan systeemrol Raadplegen:**

- De dataset van een gegevensdienst is bewust als één geheel vastgesteld — een PGO
  moet **alle** functionele data-elementen conform de dataset tonen (afwijkingen
  moeten gedocumenteerd worden, bv. via het CC-formulier).
- De PGO moet inzicht bieden in de ontvangen respons: als er geen gegevens getoond
  worden, moet duidelijk zijn óf dit komt doordat de XIS geen gegevens had, óf
  doordat er een technische fout optrad.
- De PGO moet de gebruiker inzicht geven in de **herkomst** van verzamelde gegevens
  en het moment van ophalen (metagegevens: bron + ontvangstmoment moeten worden
  vastgelegd/getoond).

**Testplatform: Conformancelab (Interoplab)**

- Account aanmaken op <https://my.interoplab.eu/auth/register>.
- Twee testmodi: "Conformance – Test" (voorbereiding/pre-kwalificatie) en
  "Conformance – Cert" (officiële kwalificatietestrun).
- Voor de systeemrol Raadplegen fungeert Conformancelab als **FHIR-server**
  (test-XIS) en is de PGO de **client** die getest wordt; Conformancelab zit als
  intermediair tussen de PGO-client en een achterliggende HAPI FHIR-server.
- Authenticatie in de testopstelling gebeurt met vaste, niet-verlopende
  Bearer-tokens (geen echte OAuth/inlogflow).
- Testscripts moeten in een **vaste, voorgeschreven volgorde** van requests
  doorlopen worden.
- Extra/vervolg-gegevens (references) pas ná afloop van het script ophalen, om te
  voorkomen dat het script faalt door voortijdige calls.
- mTLS met PKIoverheid-certificaten is optioneel in de testopstelling, maar de
  CA-chain-configuratie moet gecontroleerd worden.
- FHIR vereist expliciete tijdzones in datums; kleine afwijkingen door
  berekeningen zijn geaccepteerd.
- Testrun-links worden gedeeld met Nictiz t.b.v. beoordeling.

**Beoordeling & communicatie:**

- **Nictiz** voert de uiteindelijke (formele) kwalificatie / beoordeling uit.
- Procedurele vragen → <kwalificatie@nictiz.nl>.
- Inhoudelijke (informatiestandaard-)vragen → BITS-platform
  (<https://bits.nictiz.nl/projects/MM>).
- Servicerequests / kwalificatie aanvragen → Nictiz Servicedesk
  (<https://nictiz.atlassian.net/servicedesk/customer/portal/4>).

### 1.4 Structuur van een kwalificatiescript (illustratief voorbeeld)

Bron: MedMij:V2020.02/Basisgegevens_Langdurige_Zorg_Raadplegen (Nictiz wiki) —
gebruikt om te snappen hoe een kwalificatiescript in het algemeen is opgebouwd.
**Dit is niet de pilot-gegevensdienst** — zie §1.5 voor de daadwerkelijk gekozen
pilot (Vaccinatie-Immunisatie).

Een kwalificatiescript-pagina voor één gegevensdienst bevat meerdere **scenario's**
(bv. 1.1, 1.2, 1.4, 1.5 — één scenario, 1.3, was voorlopig buiten scope). Elk
scenario bestaat uit vaste stappen:

1. Raadpleeg de gegevens voor de testpersoon.
2. (Simulatie) beschikbaarstelling van gegevens conform de "inhoudelijke gegevens".
3. Ontvang en verwerk de FHIR-berichten.
4. Toon de gegevens in de PGO, met schermafdrukken als bewijs.

Per scenario is er een tabel met de verplichte data-elementen (met testwaarden,
SNOMED/LOINC-coderingen waar van toepassing, en onderlinge referenties, bv.
probleem → verrichting). Dit is de bron waartegen een volledigheidscheck moet
plaatsvinden. **Belangrijk:** de data die in dit soort scenario's gebruikt wordt
is testdata van fictieve testpersonen (geen echte patiëntgegevens) — relevant
voor de afweging om screenshots naar een cloud-AI-dienst te sturen (zie §7.2).

De pagina-structuur (scenario's + tabellen) is niet machine-leesbaar als API,
maar staat wel als HTML-tabellen op een publieke wiki-pagina — dus in principe
scrapebaar/parseerbaar per gegevensdienst-versie. Zie §1.6 voor een robuustere
alternatieve/aanvullende bron (publieke FHIR-testfixtures).

### 1.5 Pilot-gegevensdienst: Vaccinatie-Immunisatie Raadplegen

Bron: imm:V2_Kwalificatiescript_Vaccinatie-Immunisatie_Raadplegen, versie 2.0.4
(Nictiz wiki). **Dit is de gegevensdienst waarmee gebouwd en getest gaat worden.**

**Scenario's** (tabel 4.2 van het kwalificatiescript):

| Nr | Scenario | Doel | Verwacht resultaat |
| --- | --- | --- | --- |
| 1 | Meerdere vaccinaties raadplegen | Gestructureerde verwerking van meerdere vaccinaties met verschillende productcodes aantonen | PGO ontvangt, verwerkt en toont patiënt- en vaccinatiegegevens |
| 2 | Eén vaccinatie raadplegen | Verwerking van uitgebreide vaccinatiegegevens (incl. organisatie/zorgverlener) aantonen | PGO ontvangt, verwerkt en toont de gegevens |
| 3 | Herleiding van gegevens | Herleidbaarheid van gegevensbronnen aantonen | PGO toont bron, datum en tijdstip van raadpleging |

**Let op — twee nummersystemen op de wiki-pagina:** de tabel hierboven gebruikt
scenarionummers "1", "2", "3". Los daarvan heeft sectie 6 ("Inhoudelijke
gegevens") van het kwalificatiescript twee testdata-subsecties, genummerd
"Scenario 1.1" (testpersoon XXX_Boekwijt, meerdere vaccins) en "Scenario 1.2"
(testpersoon Antoon van de XXX_Bergge, één AstraZeneca-vaccin) — dat zijn de
testwaarden voor tabel-scenario 1 resp. 2. Dit is inhoudelijk afgeleid, niet
expliciet zo benoemd op de pagina. Voor scenario 3 (herleiding) is geen aparte
testdata-subsectie gevonden; vermoedelijk wordt hiervoor de dataset van
scenario 1.1 hergebruikt (consistent met de eerdere aanname dat herleidbaarheid
"doorgaans scenario 1.1" gebruikt) — **te verifiëren bij daadwerkelijke bouw**.

Standaardstappen per scenario (zelfde patroon als §1.4): raadplegen →
(gesimuleerd) beschikbaarstellen → ontvangen/verwerken → tonen + schermafdruk.

**Kerngegevensvelden per vaccinatie:** patiëntgegevens (naam, geboortedatum —
**BSN expliciet niet**, zie hieronder), vaccinatiegegevens (product/HPK-code,
batchnummer, datum, toedieningsweg, anatomische locatie/lateraliteit, status),
ziekte-informatie (ziekte waartegen gevaccineerd, aanleiding, indicatie),
organisatorische gegevens (zorgaanbieder-URA, zorgverlener-UZI, adres, contact).

**Coderingen:** SNOMED CT (antigenen, ziekten, anatomische locaties),
G-Standaard (HPK voor producten, tabel 6 farmaceutische vormen, tabel 7
toedieningswegen), HL7 (ParticipationType, AddressUse, RoleCode), ISO 3166-1
(landcodes), URA/UZI (organisatie-/persoonsidentificatie).

**Belangrijke bijzonderheden voor de bouw:**

- **BSN mag niet in de gegevensuitwisseling zitten** — de checklist/dataset mag
  BSN dus niet als te tonen data-element verwachten in de PGO.
- **T-datum = maandag van de testweek**; alle datums in testdata zijn relatief
  hieraan (bv. "T − 7 jaar") — relevant voor de fuzzy-matching in de
  DOM-matching-aanpak (§7.1), aangezien de daadwerkelijke datumwaarde per
  testweek verschilt.
- **Organisatiegegevens vereisen een aparte FHIR-read** op `Organisation` —
  standaard includes volstaan niet. Puur een technisch aandachtspunt voor de
  latere FHIR/Conformancelab-testvoorbereiding, niet voor de extensie zelf.
- **Geen expliciet foutafhandelings- of vrije-tekst-scenario** in dit script
  (in tegenstelling tot het §1.4-voorbeeld, dat wél een vrije-tekst-scenario
  had). Meerdere bronnen/federatief zoeken en ongestructureerde tekst vallen
  hier expliciet buiten scope. **Consequentie voor het hybride
  detectiemechanisme (§7.1):** voor déze pilot-gegevensdienst zal DOM-matching
  tegen vaste testwaarden vermoedelijk het merendeel van de detectie kunnen
  doen; de AI-vision-route is voor déze dataset vooral nuttig als vangnet bij
  afwijkende weergave van vaste waarden (bv. codetekst i.p.v. code, andere
  datumnotatie), niet primair voor vrije-tekst-interpretatie zoals eerder
  aangenomen.

**Testomgeving (input gebruiker):** we hebben toegang tot het account van
**PGO Ivido**, dat is gebruikt bij hún kwalificatie voor deze gegevensdienst
(Vaccinatie-Immunisatie). Dit is de concrete PGO-omgeving waartegen de PoC
gebouwd en geverifieerd wordt.

### 1.6 De onderliggende testdata is ook openbaar als FHIR-resources

Bron: <https://github.com/Nictiz/Nictiz-testscripts/tree/main/src/Immunization-2-0/Cert/_reference/resources>

Naast de wiki-pagina met scenario-tabellen (§1.5) publiceert Nictiz ook de
**daadwerkelijke FHIR-testfixtures** als XML-bestanden in een publieke
GitHub-repo, per gegevensdienst/versie (hier: `Immunization-2-0`). Geverifieerd:
één van deze bestanden bevat exact scenario 1.2 uit §1.5 (patiënt "Antoon van de
XXX_Bergge", vaccin AstraZeneca/2925508, batch, datum, GGD test 06, Peter de
Appel) — dus dezelfde testdata als de wiki-tabel, maar dan als gestructureerde,
machine-leesbare FHIR `Immunization`/`Patient`/`Organization`/... resources.

**Waarom dit belangrijk is voor de bouw:** dit is een veel robuustere bron voor
de "vaste testwaarden" die de DOM-matching-kant van het hybride
detectiemechanisme (§7.1) nodig heeft, dan het scrapen van HTML-tabellen van de
wiki. Een git-repo met FHIR-resources is gestructureerd, versioneerbaar, en
waarschijnlijk stabieler qua opmaak dan een wiki-pagina. In plaats van (of
naast) wiki-scraping kan de extensie deze FHIR-bestanden direct inlezen voor de
exacte testwaarden per gegevensdienst.

**Bron kan per gegevensdienst verschillen (input gebruiker):** een publieke
FHIR-resource-bron bestaat in principe voor elke kwalificatie, maar staat niet
per se altijd bij Nictiz — MedMij publiceert tegenwoordig ook zelf
gegevensdiensten. Voor de PoC (§4.1, alleen Vaccinatie-Immunisatie) is dit geen
probleem: de Nictiz-testscripts-repo hierboven is geverifieerd en voldoende.
Voor de toekomstvisie (§4.2, meerdere gegevensdiensten) betekent dit wel dat de
locatie van deze bron **niet hardcoded naar Nictiz** aangenomen moet worden.

**Koppeling wiki ↔ FHIR-resource — de wiki is source of truth (input
gebruiker):** alles wat op de wiki-pagina staat, moet terug te vinden zijn in de
FHIR-resource — maar **niet omgekeerd**. FHIR-profielen kennen soms verplichte
elementen (bv. een `status`-veld) die wél in de resource staan maar niet als
apart checklist-item op de wiki genoemd worden. Consequentie voor de bouw: de
**wiki-tabel bepaalt welke checklist-items er zijn** (§1.5); de FHIR-resource
wordt alleen gebruikt als **waarde-opzoekbron** voor precies die door de wiki
gedefinieerde items (t.b.v. DOM-matching, §7.1) — niet om zelf extra
checklist-items te genereren uit resource-velden die niet op de wiki staan.
Koppeling gebeurt dus via **gedeelde testwaarde** (dezelfde waarde staat in
beide bronnen), niet via een vooraf hardgecodeerde FHIR-pad-naar-checklist-item
mapping.

### 1.7 Bronnen

- <https://www.pgo.nl/wat-is-een-pgo/>
- <https://informatiestandaarden.nictiz.nl/wiki/MedMij:Kwalificatie:V1/Kwalificatie>
- <https://informatiestandaarden.nictiz.nl/wiki/kwalificatie:V1.0_Handleiding_Conformancelab>
- <https://informatiestandaarden.nictiz.nl/wiki/MedMij:V2020.02/Basisgegevens_Langdurige_Zorg_Raadplegen>
  (illustratief voorbeeld kwalificatiescript, §1.4)
- <https://informatiestandaarden.nictiz.nl/wiki/imm:V2_Kwalificatiescript_Vaccinatie-Immunisatie_Raadplegen>
  (pilot-gegevensdienst, §1.5)
- <https://github.com/Nictiz/Nictiz-testscripts/tree/main/src/Immunization-2-0/Cert/_reference/resources>
  (publieke FHIR-testfixtures, §1.6)

---

## 2. Probleemstelling

De pijn zit niet alleen in het *maken* van screenshots, maar in de **volledige
cyclus** rond bewijsvoering, en die cyclus is enorm tijdrovend:

1. De leverancier maakt tijdens het testen van de eigen PGO screenshots van de
   opgehaalde/getoonde gegevens.
2. Die screenshots worden handmatig in een **PowerPoint** verzameld en (impliciet
   of expliciet) toegelicht — dit **is nu daadwerkelijk het vereiste
   aanleverformat** vanuit het kwalificatiecentrum, geen vrije keuze van de
   leverancier. Voor dit project is dat echter geen bindende eis: als wij samen
   iets beters neerzetten, stappen we bewust van PPT af als doelformat van de
   extensie — ongeacht wat er vandaag wordt gevraagd.
3. De PPT wordt gedeeld met het **kwalificatiecentrum** (Nictiz).
4. De beoordelaars daar **kennen de applicatie van de leverancier niet** — ze
   missen context om zelfstandig te kunnen zien of een screenshot een scenario/
   data-element correct aantoont.
5. Dat gebrek aan context leidt tot een stroom **verduidelijkingsvragen** heen-en-
   weer tussen kwalificatiecentrum en leverancier, wat het traject enorm
   vertraagt.

**Oorzaak van de verduidelijkingsvragen** is vermoedelijk een mix (nog niet
scherp één hoofdoorzaak, "van alles wat waarschijnlijk"):

- Te weinig toelichting bij een screenshot (welk element staat waar, hoe
  verhoudt dit zich tot de verwachte testwaarde/dataset).
- Onvolledige screenshots (niet alle verplichte data-elementen van een scenario
  in beeld).
- Onduidelijke/foutieve koppeling van een screenshot aan het juiste scenario.

**Kernconclusie:** het echte doel is niet "sneller screenshots maken", maar een
**eerste inzending die zo compleet en zelfverklarend is dat het aantal
verduidelijkingsrondes drastisch daalt** — dus zowel de leverancier (minder
handwerk) als het kwalificatiecentrum (minder heen-en-weer, sneller te
beoordelen) hebben hier baat bij.

---

## 3. Doel van de extensie

**Primair doel: het aantal verduidelijkingsrondes met het kwalificatiecentrum
drastisch verminderen**, door een eerste inzending te produceren die voor een
beoordelaar die de PGO-applicatie niet kent, zelfverklarend is — niet alleen
door sneller screenshots te maken.

Een **AI-ondersteunde** browserextensie die PGO-leveranciers (DVP's — zowel
testers als developers) begeleidt bij het opbouwen van complete, herleidbare
en **toegelichte** bewijsvoering tijdens een kwalificatiesessie voor systeemrol
**Raadplegen**:

- Parseert het kwalificatiescript van een gegevensdienst (Nictiz-wiki-URL) tot
  een gestructureerde lijst van scenario's + per scenario de verplichte
  data-elementen.
- Laat de leverancier vrij door de eigen PGO navigeren; op elk moment dat er iets
  te tonen valt, triggert de leverancier een "bewijs vastleggen"-actie.
- Maakt zelf een screenshot en laat een vision-LLM (Claude) voorstellen: (a) bij
  welk scenario dit hoort, (b) welke verplichte data-elementen zichtbaar zijn, en
  (c) een korte **toelichting per element voor de beoordelaar** (bv. "dit veld
  toont [element X], verwacht conform scenario 1.1"). De leverancier controleert
  en corrigeert alle drie — de AI stelt voor, de mens beslist.
- Houdt gedurende de sessie per scenario bij welke data-elementen al zijn
  aangetoond (mét toelichting) en welke nog ontbreken.
- Genereert na afloop van de sessie een overzicht van ontbrekende elementen; de
  leverancier kan per ontbrekend element een toelichting geven (bv. "niet van
  toepassing", "afwijking gemeld via CC-formulier").
- Bundelt alles in een rapport/pakket klaar voor aanlevering — met de
  toelichtingen zichtbaar voor de beoordelaar, zodat die zelfstandig kan
  beoordelen zonder terug te hoeven vragen. **De extensie verstuurt dit niet
  automatisch** naar Nictiz/MedMij — de leverancier
  controleert en verstuurt zelf (zie §4.1, dit is een bewuste keuze).

Doelgroep: zowel QA/testers als developers bij de DVP — geen onderscheid nodig in
rechten/functionaliteit.

---

## 4. Scope

**Belangrijk onderscheid (input gebruiker): PoC nu vs. toekomstige architectuur.**
Wat hieronder als "V1"/scope beschreven staat, is een **proof of concept** die de
gebruiker zelf op de eigen laptop draait — single-user, lokale uitvoering, lokale
opslag van resultaten is voor dit stadium prima. Dit schaalt bewust (nog) niet
naar meerdere gebruikers. §4.2 beschrijft de toekomstvisie waar de architectuur
en code rekening mee moeten houden (zonder die nu al te bouwen).

### 4.1 PoC / V1 (nu)

- Systeemrol Raadplegen, generieke eisen (§1.3).
- Twee surfaces waarop de extensie draait:
  1. De **Nictiz-wiki-pagina** van het kwalificatiescript — alleen om de
     scenario's + verplichte data-elementen te parsen bij het starten van een
     sessie (eenmalig per sessie, geen continue interactie nodig).
  2. De **eigen PGO-webinterface** van de leverancier — content script voor de
     "bewijs vastleggen"-actie, screenshots, en het side-panel/overzicht.
- AI-herkenning (scenario-suggestie + data-element-detectie) via een
  cloud vision-LLM (Claude), met verplichte menselijke controle/correctie op
  elk voorstel (geen "blind vertrouwen" op de AI-uitkomst).
- Rapport-/pakket-generatie als eindresultaat van een sessie.
- **Browserondersteuning**: we beginnen met **Chromium-gebaseerde browsers**
  (Chrome, Edge, Brave, ...) — Manifest V3. Firefox e.d. niet in de PoC-scope.
- **Single-user, lokale opslag** (eigen laptop van de gebruiker) — inclusief de
  persistentie van toelichtingen over meerdere rondes (§7.1): voor de PoC mag
  dat gewoon lokaal, zolang de opslaglaag in de code voldoende geïsoleerd/
  abstract wordt opgezet om later te kunnen vervangen door gedeelde/centrale
  opslag zonder de rest te moeten herbouwen (zie §4.2).

**Expliciet géén koppeling met Conformancelab nodig.** Aanvankelijk leek dit een
optie, maar omdat de scenario-herkenning via de AI-vergelijking van
screenshot-inhoud tegen de geparste scenario-datasets verloopt (niet via het
uitlezen van Conformancelab-testrunstatus), hoeft de extensie niet op
Conformancelab/Interoplab te draaien.

**Out of scope voor de PoC (voorlopig, tenzij anders besloten):**

- Systeemrollen Sturen, Beschikbaarstellen, Ontvangen (mogelijk later).
- Automatisch/geautomatiseerd **verzenden** naar Nictiz/MedMij — er is geen
  bekende publieke inzend-API; de extensie bereidt voor, de leverancier verstuurt
  zelf (e-mail/CC-formulier/Servicedesk). Dit ook omdat het een onomkeerbare
  actie richting een externe partij is die niet zonder menselijke controle moet
  gebeuren.
- Inhoud/juistheid van medische data zelf.
- Interactie met Conformancelab/Interoplab (zie hierboven).
- Alles uit §4.2 (gebruikersaccounts, centrale/gedeelde opslag, centrale
  LLM-koppeling) — dat is toekomstvisie, niet iets om nu te bouwen.

### 4.2 Toekomstvisie (later, niet nu bouwen — input gebruiker)

Zodra dit verder gaat dan de PoC van de gebruiker zelf, is het beeld:

- **Gebruikersaccounts** — meerdere personen/leveranciers die de tool gebruiken,
  elk met eigen identiteit.
- **Centrale opslag van resultaten**, o.a. zodat toelichtingen (§7.1) niet alleen
  over rondes maar ook over **collega's/gebruikers heen** hergebruikt kunnen
  worden (de "gedeeld is gebruiksvriendelijker"-eis uit eerdere discussie hoort
  dus bij déze toekomstfase, niet bij de PoC).
- **Koppeling naar een centrale, objectieve LLM** — in plaats van dat elke
  leverancier zijn eigen Claude API-key invoert, een centraal beheerde
  AI-voorziening (mogelijk ook belangrijk voor consistente/objectieve
  beoordeling tussen verschillende leveranciers onderling).
- **Sessie-onderbreking/hervatten** — een kwalificatiesessie tussentijds kunnen
  onderbreken en later weer oppakken. Voor de PoC (§4.1) niet nodig: een sessie
  wordt in één keer afgerond.

Dit is nu vooral relevant als **ontwerprichting**: de PoC-code moet er niet
zodanig uitzien dat deze toekomst onmogelijk/pijnlijk wordt (bv. opslag en
AI-aanroep als aparte, vervangbare lagen opzetten), maar de daadwerkelijke bouw
van accounts/centrale opslag/centrale LLM valt buiten de huidige scope.

---

## 5. Open vragen (te bespreken met gebruiker)

*Geen open vragen op dit moment — nieuwe vragen komen hier terecht zodra ze
zich voordoen.*

---

## 6. Flow (V1) — Kwalificatiesessie

1. **Sessie starten.** De leverancier klikt in de extensie op "nieuwe sessie" en
   plakt de URL van het kwalificatiescript voor de betreffende gegevensdienst
   (Nictiz-wiki, bv. de pagina uit §1.4/§1.5). De extensie haalt de pagina op en
   parseert de scenario's + bijbehorende verplichte data-elementen tot een
   interne checklist (per scenario). De extensie **stelt ook een T-datum voor**
   op basis van de systeemdatum (maandag van de huidige week, conform de regel
   in §1.5), die de leverancier kan overnemen of corrigeren — bv. relevant als
   een sessie een weekgrens overschrijdt of tegen een andere testweek getest
   wordt dan de huidige.
2. **Navigeren & markeren.** De leverancier navigeert zelf, in eigen tempo, door
   de eigen PGO. Op elke pagina/moment waar relevante data te zien is, triggert de
   leverancier de "hier is bewijs"-actie (bv. via een knop in het extensie-paneel
   of een hotkey).
3. **Screenshot + hybride herkenning.** De extensie maakt zelf een screenshot
   van de pagina en herkent zichtbare data-elementen op twee manieren (§7.1):
   **DOM-matching** tegen de bekende testwaarden uit het kwalificatiescript voor
   "harde" elementen, en **AI-vision (Claude)** voor vrije tekst/interpretatie
   waar geen letterlijke testwaarde-match mogelijk is. Op basis hiervan stelt de
   extensie voor: (a) bij welk scenario dit hoort, en (b) welke verplichte
   data-elementen zichtbaar zijn — inclusief een pixel-precieze markering waar
   die via DOM-matching gevonden zijn. De leverancier krijgt dit voorstel direct
   te zien en kan het scenario en/of de gevonden elementen corrigeren vóórdat het
   wordt opgeslagen.
4. **Overzicht & aanvullen.** De extensie stelt een overzicht samen: per
   scenario welke verplichte data-elementen zijn aangetoond (met welke
   screenshot) en welke nog ontbreken. De leverancier kan per ontbrekend element
   een toelichting toevoegen (bv. niet van toepassing, of reden/verwijzing naar
   een gemelde afwijking). Dit overzicht is **geen harde afsluiting**: als de
   leverancier hier ziet dat iets vergeten is (dat wél in de PGO te tonen was),
   kan die terug naar stap 2 om het alsnog vast te leggen, en daarna weer naar
   dit overzicht — net zo vaak als nodig, binnen dezelfde lopende sessie. Dit is
   geen "sessie hervatten" (§4.2, sessie sluiten en later heropenen) maar een
   lus binnen één sessie; pas als de leverancier tevreden is, gaat de sessie
   naar stap 5.
5. **Rapport genereren.** De extensie genereert het rapport/pakket zoals
   vastgelegd in §7.1 (HTML-rapport + screenshots + JSON-metadata, verpakt in
   een zip) klaar voor aanlevering. De leverancier controleert dit rapport en
   verstuurt het zelf (e-mail/CC-formulier/Servicedesk) — **geen automatische
   verzending in de PoC** (zie §4.1).

---

## 7. Requirements

### 7.1 Functioneel

**Context: huidige praktijk rond annotatie**
De manier waarop leveranciers nu screenshots toelichten **wisselt sterk per
leverancier**: sommigen markeren netjes welk element waar staat, anderen leveren
kale screenshots aan zonder enige toelichting. Dat verschil in kwaliteit is zelf
een deel van het probleem — bij ontbrekende of niet direct herkenbare (maar wél
aanwezige) elementen kost het beoordelen extra tijd. Dit versterkt de eerdere
conclusie (§2/§3): **consistente, gestandaardiseerde annotatie** — ongeacht welke
leverancier de extensie gebruikt — is zelf al waardevol, los van welk exact
annotatie-format we kiezen.

**Rapport-inhoud (kern):**

- Het rapport toont elke vastgelegde **screenshot**, met daarop een
  **markering van de zichtbare data-elementen** uit het kwalificatiescript —
  een genummerde kaderrand + legenda, zie "Visuele markering op het beeld"
  hieronder voor de uitgewerkte vorm.
- Het rapport bevat een **checklist** van alle verplichte data-elementen uit het
  kwalificatiescript, met per element de status (aangetoond / ontbrekend). Deze
  checklist volgt **de volgorde van het kwalificatiescript zelf**, voor
  herkenbaarheid/gebruiksvriendelijkheid richting de beoordelaar.
- Tussen een screenshot en de bijbehorende regel(s) in de checklist zitten
  **hyperlinks in beide richtingen**: vanaf een gemarkeerd element op een
  screenshot naar de betreffende checklist-regel, en vanuit de checklist terug
  naar de screenshot(s) waarop dat element te zien is.

**T-datum bepaling bij sessiestart:** de extensie
moet vóór de run weten welke T-datum gehanteerd wordt, omdat alle datumwaarden
in de testdata relatief zijn aan de T-datum (§1.5). De extensie **stelt de
T-datum voor op basis van de systeemdatum** (maandag van de huidige week,
conform de regel in §1.5), en de leverancier kan dit voorstel **corrigeren**
vóór de sessie start — zelfde patroon als elders in dit plan (voorstel door de
extensie, mens controleert/corrigeert). De vastgestelde T-datum is nodig als
invoer voor de datum-matching binnen het DOM-matching-deel van het hybride
detectiemechanisme (hieronder).

**Algoritme:**

```text
dag_van_week = ISO-weekdag(vandaag)   // maandag = 1 ... zondag = 7
T = vandaag - (dag_van_week - 1) dagen
```

Dit dekt zowel "vandaag is al maandag" (T = vandaag) als "vandaag is een andere
dag" (T = meest recente maandag) in één formule, zonder vertakking.

Twee aandachtspunten bij de implementatie:

- **Tijdzone-bron**: "vandaag" moet de **lokale datum van de leverancier**
  (browser-lokale tijd) zijn, niet bv. UTC op een server — anders kan rond
  middernacht de verkeerde dag als "vandaag" gelden.
- **Vastzetten bij sessiestart**: als een sessie de middernachtsgrens
  overschrijdt (bv. gestart zondagavond, doorlopend tot maandag), wordt de
  T-datum **niet automatisch herberekend** tijdens de sessie — die blijft vast
  voor de hele sessie, ook als de kalenderweek intussen wisselt.

**Detectiemechanisme: hybride**
Geen voorbeeld-PPT beschikbaar om de huidige annotatiestijl op af te stemmen
(gebruiker beschikt er niet over) — de aanpak is dus vanuit logica bepaald i.p.v.
vanuit een bestaand voorbeeld:

- **DOM-matching** voor data-elementen met een **vaste, vooraf bekende
  testwaarde** (namen, codes, datums uit de kwalificatiescript-tabellen/
  FHIR-testfixtures van de pilot, §1.5/§1.6): de extensie zoekt deze waarden
  direct in de HTML/DOM van de PGO-pagina op en tekent op basis daarvan een
  **pixel-precieze markering**, zonder AI nodig te hebben. Goedkoper en
  preciezer dan een schatting door een vision-model.
- **AI-vision (Claude)** voor data-elementen die **vrije/ongestructureerde
  tekst** betreffen (bv. het "zorgplan als vrije tekst"-scenario uit het
  §1.4-voorbeeld) of waar geen letterlijke testwaarde-match mogelijk is: hier
  is inhoudelijke interpretatie nodig i.p.v. tekst-matching. **Voor de huidige
  pilot (Vaccinatie-Immunisatie, §1.5) is dit pad grotendeels theoretisch** —
  die gegevensdienst heeft geen vrije-tekst-scenario, dus DOM-matching doet hier
  naar verwachting het meeste werk (zie §1.5).
- Openstaand aandachtspunt (geen blokkerende vraag, wel iets om in de techniek
  rekening mee te houden): een PGO kan een "vaste" testwaarde ook geformatteerd,
  vertaald of anders opgemaakt tonen (bv. datumnotatie, naamvolgorde) — pure
  exacte tekst-match kan dan missen. DOM-matching zal dus enige fuzzy-matching
  nodig hebben, niet alleen exacte string-vergelijking.

**Visuele markering op het beeld**

- Genummerde kaderrand (geen vlakvulling) om elk herkend data-element, met een
  klein volgnummer-badge in de hoek. Nummering volgt de checklist-volgorde
  binnen het scenario (zie hieronder). Een korte legenda bij de screenshot
  koppelt volgnummer → elementnaam → checklist-link.
- Elementen via **DOM-matching** krijgen een pixel-precies kader; elementen via
  **AI-vision** (vrije tekst) krijgen mogelijk een ruwer gebied/blok in plaats
  van scherp om een los woord — technische beperking, geen blokkerend punt.
- **Kaderkleur**: bepaald door de extensie zelf, **zonder bevestigingsstap**
  door de leverancier (bewust geen human-in-the-loop hier, in tegenstelling tot
  de scenario/element-voorstellen — de inschatting is simpel genoeg: PGO's tonen
  gegevens doorgaans op een rustige achtergrondkleur). De extensie kiest een
  kleur die contrasteert met de dominante kleur(en) van de PGO-pagina, uit een
  kleine vaste kandidaten-palet.
- De kleur ligt **vast per sessie** (niet per PGO/permanent), omdat PGO's hun UI
  doorontwikkelen — bij een nieuwe sessie wordt opnieuw bepaald wat op dat
  moment contrasteert.

**Meerdere voorkomens & scenario-indeling**

- Als één data-element op meerdere screenshots voorkomt, linkt de checklist
  naar **alle** screenshots waarop het element te zien is (niet alleen de
  eerste/beste).
- De checklist is **per scenario** een eigen sectie/subsectie (niet één
  doorlopende lijst voor de hele gegevensdienst), met behoud van
  scriptvolgorde binnen elk scenario.

**Overwogen en afgewezen:** een aparte link van een screenshot naar
het scenario als geheel, los van de individuele elementen. Geen duidelijke use
case: scenario's zonder individuele data-elementen (bv. scenario 1.2 — correcte
lege-staat/foutmelding tonen bij ontbrekende zorginhoudelijke gegevens) kunnen
die eigenschap gewoon zelf als **checklist-item** krijgen, waarmee de bestaande
element-link volstaat. Geen aparte requirement nodig.

**Output-formaat van het rapport:** een zelfstandig **HTML-rapport** (opent
lokaal in de browser, geen server nodig) waarin de bidirectionele hyperlinks
tussen screenshot en checklist-regel en de genummerde markeringen native
werken. Dit HTML-rapport wordt samen met de screenshot-afbeeldingen en een
JSON-metadatabestand (scenario → element → screenshot-referentie) verpakt in
een **zip** — dát zip-bestand is het ene deliverable dat de leverancier
aanlevert. Geen aparte PDF-renderpijplijn: een PDF zou de interactieve
navigatie kwijtraken voor weinig meerwaarde t.o.v. gewoon het HTML-bestand
openen; als er ooit toch een platte PDF nodig is, kan dat later als degraded
fallback via "print HTML naar PDF", geen aparte requirement nu.

**Persistentie van toelichtingen over meerdere rondes (input gebruiker):** een
kwalificatie voor een gegevensdienst kost vaak meerdere rondes. Toelichtingen die
de leverancier bij ontbrekende elementen heeft geschreven (§6, stap 4) mogen niet
opnieuw getypt hoeven worden bij een volgende ronde — ze moeten **persisteren en
automatisch ingeladen worden** bij een nieuwe sessie voor dezelfde gegevensdienst.
Dit is dus geen "sessie hervatten" (één lopende sessie onderbreken/doorgaan —
dat is toekomstvisie, zie §4.2), maar het **onthouden van eerder ingevoerde
toelichtingen tussen losse, opeenvolgende sessies/rondes** in.

Werkwijze: bij het starten van een nieuwe sessie voor een gegevensdienst waar al
eerder toelichtingen voor zijn ingevoerd, worden die getoond als **bewerkbare
pre-fill** per checklist-item (zelfde patroon als elders: eerdere invoer stelt
voor, leverancier kan aanpassen als de situatie is veranderd).

**Identificatie:** "dezelfde gegevensdienst" wordt herkend aan de **URL van het
kwalificatiescript** die de leverancier bij sessiestart al plakt (§6, stap 1) —
geen apart identificatiemechanisme nodig, deze URL ligt toch al vast als invoer
per sessie. Toelichtingen worden dus opgeslagen per combinatie
kwalificatiescript-URL + scenario + checklist-item.

**Opslag: PoC vs. toekomst (zie §4.1/§4.2).** Idealiter is deze opslag
**gedeeld** tussen collega's die samen aan dezelfde kwalificatie werken
(gebruiksvriendelijker dan puur lokaal per apparaat/profiel) — maar dat is
**toekomstvisie (§4.2)**, geen PoC-eis. Voor de huidige PoC (§4.1, single-user,
eigen laptop van de gebruiker) is **lokale opslag prima**. Aandachtspunt voor de
code: de opslaglaag voldoende geïsoleerd/abstract opzetten zodat lokale opslag
later vervangen kan worden door gedeelde/centrale opslag zonder de rest van de
extensie te moeten herbouwen.

### 7.2 Niet-functioneel

- **Alleen testdata, nooit productie**: screenshots worden naar een cloud-AI
  gestuurd, wat alleen acceptabel is omdat kwalificatiescenario's fictieve
  testdata gebruiken (§1.4). Geen expliciete veiligheidsklep/waarschuwing tegen
  gebruik met echte patiëntgegevens ingebouwd — de extensie is sowieso alleen
  bedoeld voor gebruik tijdens kwalificatietrajecten, dus dat voegt weinig toe.
- Browserondersteuning: zie §4.1 (Chromium-gebaseerd, Manifest V3).
- Overige punten *TBD*: offline werking, bewaartermijn van sessiedata en
  screenshots.

---

## 8. Technische aanpak (voorstel — nog te bespreken)

Onderstaand voorstel werkt de architectuur uit tot concrete, beargumenteerde
keuzes voor de PoC. Elke keuze staat met de belangrijkste trade-off erbij. Waar
iets een echte, open keuze is (en niet één duidelijk "juist" antwoord heeft),
is dat expliciet benoemd — dit is nog niet besproken/vastgesteld met de
gebruiker.

Rode draad: er zijn twee lagen die volgens de requirements (§4.1/§4.2) later
vervangbaar moeten zijn — **opslag** en **AI-aanroep**. Beide krijgen daarom
een dun, expliciet interface-contract (een "poort"), met voor de PoC één
simpele lokale implementatie erachter. De rest van de extensie praat alléén
tegen het contract, nooit rechtstreeks tegen IndexedDB of `api.anthropic.com`.
Dat is de enige structurele investering die we nú doen voor de toekomstvisie;
verder bouwen we bewust minimaal.

### 8.1 Taal en tooling

**TypeScript, met een bundler (Vite + de CRXJS-plugin voor Manifest V3).**

- **TypeScript i.p.v. plain JS.** De datastructuren in dit project zijn het
  hart van de correctheid: geparste scenario's, checklist-items, de koppeling
  scenario → element → screenshot, en het JSON-metadatabestand in het rapport.
  Met types worden die structuren één keer vastgelegd en overal gecontroleerd;
  dat vangt bij een PoC die door één persoon in stukjes gebouwd wordt juist de
  sluipende fouten (verkeerde veldnaam, vergeten geval). Trade-off: iets meer
  opstartkosten (buildstap, typedefinities) tegenover plain JS dat direct in de
  browser laadt. Voor een wegwerp-prototype van 100 regels zou plain JS
  volstaan; voor iets met parser + matcher + rapportgenerator die je meerdere
  rondes gaat gebruiken, weegt de typeveiligheid ruimschoots op.
- **Bundler: Vite met de CRXJS-plugin (besloten).** De MV3 background service
  worker draait als ES-module en mag geen losse `<script>`-imports of remote
  code laden; alle afhankelijkheden (parser-hulp, een zip-bibliotheek, een
  fuzzy-match-bibliotheek) moeten vooraf gebundeld zijn tot bestanden die de
  extensie zelf meelevert. Een bundler regelt dat, plus het splitsen naar de
  aparte entrypoints die MV3 kent (service worker, content script, side panel,
  options). Vite+CRXJS genereert/valideert daarbij ook het `manifest.json`,
  verzorgt de HMR-ontwikkelervaring voor extensies, en neemt de
  MV3-eigenaardigheden (module-service-worker, content-script-injectie) uit
  handen — dat weegt voor een PoC zwaarder dan de iets lichtere, maar
  handmatig te bedraden route via kale `esbuild`.
- **UI-framework voor de side panel: Preact** (besloten). De side-panel-UI is
  een handvol schermen (sessie starten, voorstel controleren/corrigeren,
  overzicht/aanvullen, rapport genereren) met reactieve lijstjes en
  formuliertjes — dat vraagt om *iets* van reactiviteit, maar niet om het
  gewicht van een volledig React-ecosysteem. Preact (React-achtige API, ~4kB)
  en Svelte (compileert weg) waren beide technisch geschikt; de doorslag is
  **beste ondersteuning in deze specifieke niche**: de Vite/CRXJS-
  extensie-ecosystem (§8.1 hierboven) heeft merkbaar meer voorbeelden,
  boilerplates en community-support voor React/Preact dan voor Svelte
  specifiek in combinatie met Manifest V3 side panels — en Preacts
  vrijwel-1-op-1 API met React ontsluit bovendien die veel grotere
  React-kennisbank bij het troubleshooten. Voor het **HTML-rapport** juist
  géén framework (zie §8.7).

### 8.2 Extensie-structuur (Manifest V3-onderdelen)

De vier MV3-onderdelen krijgen elk een scherp afgebakende rol. De leidende
gedachte: **de side panel is het brein/orchestrator, het content script is de
"handen" op de PGO-pagina, de service worker is enkel een dunne router, en de
options-pagina beheert de configuratie (API-key).**

- **Side panel (`chrome.sidePanel`) — orchestrator en enige langlevende
  context tijdens de sessie.** Hier leeft de sessie-state (geparste scenario's,
  T-datum, vastgelegde bewijzen, voortgang per element), draait de UI van stap
  1–5, en worden de "zware" acties uitgevoerd: de wiki/FHIR-fetch bij
  sessiestart, de Claude-aanroep, en de rapport/zip-generatie. **Motivatie:**
  de service worker in MV3 wordt agressief afgeschoten na ~30s inactiviteit;
  een langlopende `fetch` naar de Claude API of het opbouwen van een zip mag je
  daar niet aan toevertrouwen. De side panel is een normale extensiepagina die
  blijft leven zolang hij open is — en dat past exact op de PoC-aanname
  "browser blijft open, één doorlopende sessie" (§6). Bijkomend voordeel: de
  side panel staat naast de PGO-pagina in beeld, wat de "navigeren &
  markeren"-flow natuurlijk maakt.
- **Content script (op de PGO-pagina, en apart op de wiki-pagina) — de
  "handen" in de pagina.** Het content script heeft als enige toegang tot de
  DOM van de bezochte pagina. Op de **PGO-pagina** doet het: (a) DOM-tekst
  uitlezen en fuzzy-matchen tegen de bekende testwaarden, (b) van gevonden
  treffers de pixelcoördinaten (`getBoundingClientRect`) opleveren, en (c)
  desgevraagd naar een specifiek element scrollen. Op de **wiki-pagina** doet
  een minimaal content script alleen het parsen van de HTML-tabellen bij
  sessiestart (alternatief: de wiki wordt gewoon via `fetch` opgehaald en in de
  side panel geparsed — zie §8.5; dan is op de wiki helemaal geen content
  script nodig). Het content script maakt zélf géén screenshot en doet géén
  AI-aanroep — het levert alleen DOM-feiten en coördinaten terug aan de side
  panel. **Motivatie:** de scheiding "content script = DOM-feiten, side panel =
  beslissingen en netwerk" houdt de gevoelige/vervangbare delen (AI, opslag)
  uit de pagina-context, waar ze niet horen en waar ze bovendien lastiger te
  isoleren zijn.
- **Background service worker — dunne router/coördinator, verder zo leeg
  mogelijk.** MV3 verplicht een service worker als je bepaalde events wilt
  afvangen (bv. een toolbar-klik of een global hotkey via `chrome.commands`) en
  als plek om de side panel te openen. **Besloten: de "hier is
  bewijs"-trigger ondersteunt zowel een hotkey als een knop in de side panel**
  — mensen mogen kiezen wat prettiger werkt. Dat verandert weinig aan de
  structuur: beide paden leiden naar dezelfde onderliggende capture-en-
  detectiestap, alleen het startpunt verschilt. Bij de **hotkey** komt de
  actie binnen bij de service worker (`chrome.commands`), die dan
  `chrome.tabs.captureVisibleTab` aanroept en het resultaat doorstuurt naar de
  side panel. Bij de **knop** roept de side panel dat direct zelf aan, zonder
  omweg via de worker. We houden de worker verder bewust dun omdat elke logica
  die er tóch in staat, moet overleven dat de worker tussendoor wordt
  afgeschoten; state blijft uitsluitend in de side panel.
- **Options-pagina — configuratie, primair de Claude API-key.** Eén simpel
  scherm waar de gebruiker zijn eigen API-key invoert (§8.4). Aparte
  options-pagina i.p.v. een veld in de side panel omdat een key iets is dat je
  één keer instelt, niet per sessie — en omdat je zo de key-opslag netjes
  gescheiden houdt van de sessie-state.

### 8.3 Screenshot + markering (het hart van het content-script-werk)

Dit valt uiteen in drie technische stukken: de screenshot maken, de
testwaarden in de DOM vinden, en de gevonden coördinaten vertalen naar een
tekening op de afbeelding.

**Screenshot-API: `chrome.tabs.captureVisibleTab` — dus het zichtbare
viewport, niet de volledige pagina (besloten).**

- `captureVisibleTab` levert een PNG/JPEG data-URL van precies wat nu in beeld
  is. Dit is de eenvoudige, betrouwbare, standaard-MV3-weg en vereist geen
  intrusieve rechten.
- **Bewust géén full-page-capture.** Dat zou gekund hebben via (a)
  scrollen-en-stitchen — broos (fixed/sticky headers dupliceren, lazy-loaded
  content verspringt) en de coördinatenwiskunde wordt lastiger; of (b) de
  DevTools-protocol-route (`chrome.debugger` + `Page.captureScreenshot`) — die
  toont een opvallende gele "…wordt gedebugd door een extensie"-balk en vraagt
  zwaardere rechten. Viewport-capture sluit ook inhoudelijk het beste aan: de
  gebruiker triggert bewust op het moment dat de relevante data in beeld staat,
  dus "wat de gebruiker ziet" ís het bewijs. Als
  een scenario meer toont dan in één viewport past, legt de gebruiker
  simpelweg meerdere bewijzen vast (dat wordt door het datamodel toch al
  ondersteund: één element mag op meerdere screenshots voorkomen).
  Full-page-stitching kan later als losse verbetering, het is geen blokkade nu.
- **devicePixelRatio is load-bearing.** `captureVisibleTab` levert het beeld op
  *device-pixel*-resolutie; op een HiDPI/Retina-scherm is dat 2× (of meer) de
  CSS-pixels. `getBoundingClientRect` geeft daarentegen *CSS*-pixels. De
  vertaling is dus: `screenshot_x = css_x * devicePixelRatio` (idem voor
  y/breedte/hoogte), met `window.devicePixelRatio` uitgelezen in het content
  script op het moment van capture. Deze factor verkeerd toepassen is de meest
  waarschijnlijke bron van "kaders staan net verschoven"; het hoort expliciet
  in het contract tussen content script (levert CSS-rects + dpr) en side panel
  (tekent op device-pixels).

**DOM-tekst-matching (het "harde" detectiepad).**

- Het content script bouwt een index van zichtbare tekst: het loopt de
  relevante tekstknopen af (bv. via een `TreeWalker` over `Node.TEXT_NODE`, of
  de tekst per "blad"-element), en normaliseert die (spaties, hoofdletters,
  diacritieken, en waar zinvol datum-/getalnotatie).
- Tegen deze index matcht het de set **verwachte testwaarden** die uit het
  kwalificatiescript/FHIR-fixtures komt (§8.5). Omdat een PGO een waarde anders
  kan formatteren, vertalen of opmaken (§7.1), is **exacte string-match
  onvoldoende**; er is fuzzy-matching nodig. Praktische aanpak, oplopend in
  slimheid: (1) genormaliseerde exacte match; (2) token-/substring-match voor
  namen en samengestelde velden; (3) een tolerante afstand (bv. Levenshtein via
  een klein bibliotheekje) voor kleine afwijkingen; (4) **veld-specifieke
  normalisatie** voor de categorieën die er hier echt toe doen — met name
  **datums** (alle testdatums zijn relatief aan de T-datum, dus de matcher
  rekent de verwachte absolute datum uit de T-datum en herkent meerdere
  notaties) en **codes** (een SNOMED/HPK-code kan als code óf als codetekst
  getoond worden — beide als geldige treffer accepteren). Dit is precies waar
  de meeste bouwtijd in gaat zitten; het is bewust geen generieke "AI doet het
  wel", omdat DOM-matching goedkoper en pixel-preciezer is dan een visie-model
  (§7.1).
- Per treffer levert het content script terug: welk verwacht element geraakt
  is, de `getBoundingClientRect`-coördinaten (er kunnen meerdere rects zijn als
  tekst over regels breekt — dan de omhullende rechthoek nemen), en een
  matchvertrouwen. De side panel toont dit als voorstel; **de mens beslist**
  (§3) vóór opslaan.

**Van coördinaten naar tekening op de afbeelding: op een canvas in de side
panel.**

- De side panel laadt de screenshot-data-URL in een off-screen `<canvas>`,
  tekent daar per bevestigd element een **genummerde kaderrand** (geen
  vlakvulling) plus een klein volgnummer-badge, met de contrasterende
  kaderkleur die de extensie zelf per sessie kiest (§7.1 — kleurkeuze zonder
  bevestigingsstap, uit een klein vast palet, op basis van de dominante
  paginakleur die uit de screenshot-pixels te bepalen is). Vervolgens
  exporteert het canvas een nieuwe PNG (`canvas.toBlob`) — dat is de
  gemarkeerde afbeelding die in het rapport komt.
- **Waarom in de side panel en niet in het content script:** het tekenen hoort
  bij de bewijs-samenstelling (mens heeft net bevestigd/gecorrigeerd), en de
  side panel is de plek die de screenshot + de bevestigde elementen + de
  nummering bij elkaar heeft. Het content script hoeft alleen de rauwe rects te
  leveren.
- AI-vision-treffers (vrije tekst) krijgen mogelijk een ruwer gebied i.p.v. een
  pixel-scherp kader (§7.1) — dat is een gegeven van het model, geen blokkade.

### 8.4 Claude API-aanroep (het AI-vision-pad)

**Aanroeppatroon: één multimodale `messages`-call per vast te leggen bewijs,
met de gemarkeerde/rauwe screenshot als afbeelding plus de bekende context als
tekst, die één gestructureerd voorstel teruggeeft.**

- **Wat er in de call gaat.** De side panel stuurt: (a) de screenshot als
  image-block; (b) een tekstblok met de "grondwaarheid" die we al kennen — de
  lijst scenario's van deze gegevensdienst en per scenario de verwachte
  elementen/testwaarden, plus welke elementen DOM-matching al heeft gevonden.
  (c) een instructie om terug te geven: bij welk scenario dit hoort, welke
  verwachte elementen zichtbaar zijn, en een korte toelichting per element.
  **Waarom de bekende testwaarden mee de call in gaan:** zo hoeft het model
  niet "blind" te raden, maar doet het het werk waar het goed in is —
  inhoudelijke interpretatie van wat DOM-matching niet letterlijk kon vinden —
  binnen de grenzen die wij al kennen. De DOM-matcher en het model worden dus
  niet twee losse meningen die je achteraf verzoent; DOM-matching gaat eerst,
  en de AI vult aan/interpreteert het restant. Voor de pilot-gegevensdienst
  (geen vrije tekst, §1.5) is dit pad naar verwachting een vangnet, niet de
  hoofdmoot.
- **Gestructureerde uitvoer.** Vraag het model om een vast JSON-schema terug te
  geven (scenario-id + lijst van elementen met per element zichtbaar-ja/nee,
  toelichting, en waar mogelijk een grofweg gebied), zodat de side panel het
  antwoord deterministisch kan omzetten in het te-controleren voorstel. Dat
  voorstel gaat áltijd langs de mens vóór opslaan (§3).
- **Model: escalatieladder in plaats van één vast model (besloten).** Geen
  vaste modelkeuze — standaard wordt het goedkoopste/snelste vision-model
  gebruikt (Haiku-klasse, bv. `claude-haiku-4-5`), met escalatie naar een
  sterker model (`claude-opus-4-8`) wanneer dat nodig is. Escalatietriggers:
  (a) DOM-matching had voor dit scenario weinig elementen al gevonden — dus er
  is veel interpretatiewerk nodig, precies waar een sterker model meerwaarde
  heeft; (b) het tier-1-antwoord rapporteert laag zelf-vertrouwen op een of
  meer elementen, of voldoet niet aan het verwachte JSON-schema (§8.4
  hierboven) — dan wordt dezelfde call opnieuw gedaan met het sterkere model.
  Faalt ook die escalatie, dan geldt alsnog de degradatie uit §8.9 (terugvallen
  op het kale DOM-matching-resultaat). Zo blijft het gros van de
  (eenvoudige) gevallen goedkoop, en wordt het duurdere model alleen ingezet
  waar het er echt toe doet. Dit past in hetzelfde `AiVisionProvider`-contract:
  de tier-keuze/escalatielogica zit in de implementatie, niet in de rest van de
  extensie.

**Sleutelopslag en -invoer.** De gebruiker voert zijn eigen API-key in via de
options-pagina; die wordt lokaal bewaard (via de opslaglaag, §8.6). Voor de PoC
is dit acceptabel (§4.1); privacy is afgedekt doordat screenshots uitsluitend
fictieve testdata bevatten (§7.2).

**Isolatie/vervangbaarheid (de kern van de §4.2-eis).** De hele aanroep gaat
door één dun contract, bv. `AiVisionProvider` met één methode als
`suggestEvidence(screenshot, knownContext) → EvidenceSuggestion`. Voor de PoC
zit daarachter één implementatie die rechtstreeks naar `api.anthropic.com`
post. Twee dingen zijn hier load-bearing:

- **Browser-directe aanroep vereist een expliciete opt-in-header.** De
  Anthropic-API blokkeert standaard browser-aanroepen (CORS); je moet de
  header `anthropic-dangerous-direct-browser-access: true` meesturen (en, als
  je de officiële SDK bundelt, `dangerouslyAllowBrowser: true` zetten). Zonder
  dit faalt elke call vanuit de extensie. Dit is bewust "dangerous" genoemd
  omdat het je key aan de client blootstelt — voor deze single-user PoC is dat
  het geaccepteerde model.
- **Aanbeveling: geen SDK-afhankelijkheid in de kern, maar een
  `fetch`-adapter achter het contract.** Een kale `fetch`-implementatie van
  `AiVisionProvider` houdt de rest van de code onafhankelijk van de precieze
  SDK-vorm; als er later een centrale backend + centraal beheerde LLM komt
  (§4.2), schrijf je enkel een tweede implementatie van hetzelfde contract
  (`BackendAiVisionProvider` die naar jouw eigen endpoint post, zonder key in
  de browser) en verandert er niets aan de detectie-/voorstel-logica. Dat is
  precies de "vervangbaar zonder herbouw"-eis, en het kost nu vrijwel niets
  extra.

Minimale foutafhandeling hier: zie §8.9 — een falende AI-call mag een sessie
nooit laten crashen.

### 8.5 FHIR-testfixtures ophalen en wiki-scrapen

Inhoudelijk is al besloten (§1.6): **de wiki bepaalt wélke checklist-items er
zijn; de FHIR-resource is enkel waarde-opzoekbron.** Technisch:

- **Wiki (leidend voor de structuur).** Bij sessiestart haalt de side panel de
  door de gebruiker geplakte kwalificatiescript-URL op via `fetch` en
  parseert de HTML-tabellen met `DOMParser` (de scenario's + per scenario de
  verplichte data-elementen). **Trade-off wiki via `fetch`+`DOMParser` vs. via
  een content script op de wiki-tab:** `fetch`+`DOMParser` vanuit de side panel
  is eenvoudiger (geen tweede tab/injectie nodig, en de wiki-interactie is toch
  eenmalig en niet-interactief, §4.1) en heeft mijn voorkeur; het vereist wel
  host-permission voor het wiki-domein (§8.8). De HTML-structuur van een
  wiki-pagina is broos — daarom een dunne, defensieve parser die op
  tabelkoppen/kolomposities matcht en luid faalt (duidelijke melding) als de
  structuur niet herkend wordt, i.p.v. stilzwijgend een halve checklist te
  produceren.
- **FHIR-fixtures (leidend voor de waarden).** De publieke XML-fixtures staan
  in een GitHub-repo (§1.6). Ophalen via `fetch` op de *raw* content-URL's en
  parsen met `DOMParser` (XML-modus). Hieruit trekt de extensie de exacte
  testwaarden (namen, codes, datums, batchnummers) die de DOM-matcher (§8.3)
  nodig heeft. De koppeling wiki↔FHIR gebeurt **via gedeelde testwaarde**, niet
  via een hardgecodeerde FHIR-pad-mapping (§1.6): de extensie zoekt de
  wiki-checklist-waarden op in de FHIR-resource om verrijkte/genormaliseerde
  matchvarianten te krijgen (bv. de rauwe code naast de weergavetekst).
- **Niet hardcoden naar Nictiz.** Omdat de bron-locatie per gegevensdienst kan
  verschillen (§1.6), wordt de FHIR-bron-URL configuratie (per
  sessie/gegevensdienst instelbaar), niet een vaste constante. Voor de pilot is
  de geverifieerde Nictiz-repo de default.
- **Beide achter een dun bron-contract.** Net als bij opslag/AI: een
  `QualificationSourceProvider` die "geef scenario's + checklist" en "geef
  testwaarden" levert, met voor nu een wiki+GitHub-implementatie. Dat maakt het
  later triviaal om een andere bron (bv. een door MedMij zelf gepubliceerde
  bron) toe te voegen.

### 8.6 Opslagtechnologie voor de PoC

**Twee soorten data, twee kandidaten, achter één opslag-contract.**

De data valt uiteen in (a) kleine, tekstuele, langlevende data — met name de
**toelichtingen die tussen sessies moeten persisteren** (§7.1), plus de
API-key en wat voorkeuren; en (b) grote binaire data — de **screenshots**
tijdens een lopende sessie.

- **IndexedDB als enige opslag, ook voor de kleine data (besloten).**
  IndexedDB kan zowel grote blobs (screenshots) als gestructureerde records
  aan, met ruime quota (met de `unlimitedStorage`-permission praktisch
  onbeperkt op de laptop). `chrome.storage.local` zou voor de tekstuele data
  (API-key, toelichtingen, voorkeuren) op zichzelf simpeler zijn, maar heeft
  een krappe standaardquota en is niet gemaakt voor de vele-MB's aan PNG's die
  één sessie oplevert — en twee opslagmechanismen door elkaar gebruiken voor
  een single-developer PoC levert meer onderhoudslast op dan het oplevert. Eén
  systeem, met een dunne wrapper (of een mini-bibliotheek zoals `idb`) die de
  bekende omslachtigheid van de rauwe IndexedDB-API wegneemt.
- **Waarom niet het bestandssysteem.** Direct naar de laptop-schijf schrijven
  kan een extensie niet zonder een expliciete gebruikers-download-actie; het
  eind-deliverable gáát wel via een download (de zip, §8.7), maar de werkende
  opslag tijdens/tussen sessies hoort in de browser-opslag, niet in losse
  bestanden.

**De isolatie/vervangbaarheid — dit is de belangrijkste ontwerpbeslissing voor
§4.2.** Alle opslag loopt via een **repository-interface-patroon**: kleine,
doel-specifieke contracten die uitdrukken *wat* opgeslagen wordt, niet *hoe*.
Bijvoorbeeld:

- `AnnotationRepository` — de over-rondes-persisterende toelichtingen,
  gesleuteld op `kwalificatiescript-URL + scenario + checklist-item` (precies
  de identificatie uit §7.1), met methodes als `getForDataservice(url)` en
  `upsert(key, text)`.
- `SessionEvidenceStore` — screenshots en bewijs-records van de lopende
  sessie.
- `SettingsRepository` — API-key en voorkeuren.

Voor de PoC zit achter elk van deze een IndexedDB-implementatie. De rest van de
extensie kent alléén de interfaces. **Waarom dit precies de toekomstvisie
afdekt:** wil je later gedeelde/centrale opslag (§4.2, "toelichtingen
hergebruiken over collega's heen"), dan implementeer je één nieuwe klasse —
bv. `RemoteAnnotationRepository` die tegen een backend-API praat — en verandert
er niets aan de detectie-, overzicht- of rapportlogica. De sleutel-vorm (`URL +
scenario + item`) is bewust nu al zó gekozen dat hij ook in een gedeelde
database uniek en zinnig is. Dit is de enige plek waar we nú iets "extra" doen
voor later, en het kost weinig: het is voornamelijk discipline (praat via de
interface), niet extra code.

### 8.7 Rapportgeneratie (HTML + screenshots + JSON, in een zip)

**Zelfstandig HTML-rapport, gegenereerd als string in de side panel, samen met
de afbeeldingen en één JSON-metadatabestand in een zip verpakt, en via
`chrome.downloads` weggeschreven.**

- **HTML zonder framework/runtime.** Het rapport is het deliverable dat een
  externe beoordelaar lokaal opent (§7.1); het moet volledig zelfstandig
  werken zonder server en zonder build-afhankelijkheden. De bidirectionele
  hyperlinks tussen een gemarkeerde screenshot en de bijbehorende
  checklist-regel zijn gewoon **interne anker-links**
  (`<a href="#element-3">` ↔ `<a href="#shot-7">`) — dat werkt native in elke
  browser, precies wat §7.1 vraagt. Daarom hier bewust **geen** framework: een
  generator die uit de sessie-state een platte HTML-string bouwt (met een
  sjabloon), is het robuustst en heeft geen enkele externe afhankelijkheid in
  het eindbestand. De checklist volgt de scriptvolgorde per scenario;
  nummering van kaders volgt de checklist-volgorde binnen het scenario (§7.1).
- **Afbeeldingen: losse bestanden in de zip (besloten).** De gemarkeerde
  screenshots (de PNG's uit §8.3) gaan als losse bestanden in de zip; het HTML
  verwijst er relatief naar (`<img src="shots/shot-7.png">`). Het alternatief
  (inline als data-URI's) zou het HTML fors en trager maken zonder praktisch
  voordeel, aangezien het deliverable toch altijd de hele zip is — het
  "HTML werkt ook los"-voordeel van inline speelt dus niet.
- **JSON-metadata.** Eén `metadata.json` met de machine-leesbare koppeling
  scenario → element → screenshot-referentie (§7.1). Dit is dezelfde
  datastructuur die de side panel intern al bijhoudt, geserialiseerd — dus
  vrijwel gratis.
- **Zip-generatie in de browser: JSZip (besloten).** Er is geen ingebouwde
  zip-API; gebruik een kleine, in de bundle meegeleverde bibliotheek. JSZip
  (bekender, eenvoudigere hoger-niveau API: `zip.file(naam, inhoud)`,
  `zip.generateAsync()`) boven `fflate` (kleiner/sneller maar lager-niveau) —
  voor een browserextensie maakt het gewichtsverschil vrijwel niets uit, en de
  eenvoudigere, beter gedocumenteerde API weegt zwaarder. De zip wordt als
  `Blob` opgebouwd.
- **Wegschrijven.** De zip-blob wordt via de `chrome.downloads`-API (of een
  `<a download>`-blob-URL) als één bestand aangeboden aan de gebruiker. **Geen
  automatische verzending** naar het kwalificatiecentrum (§4.1); de mens
  controleert en verstuurt zelf. Geen PDF-pijplijn (§7.1).

### 8.8 Manifest V3-permissies en host-permissions

Het uitgangspunt is **zo smal mogelijk**, wat ook past bij een extensie die
maar op een handvol plekken hoeft te werken.

- **API-permissions:** `sidePanel` (de UI-hub), `storage`
  (settings/`chrome.storage.local` indien gebruikt), `unlimitedStorage`
  (ruimte voor screenshots in IndexedDB), `downloads` (de zip wegschrijven), en
  `scripting` + `activeTab` (content script injecteren en de actieve tab
  bewerken/capturen). Eventueel `commands` als je een globale hotkey voor "hier
  is bewijs" wilt.
- **Screenshot-permissie-detail (load-bearing):**
  `chrome.tabs.captureVisibleTab` werkt met `activeTab` (of anders
  `<all_urls>`); door op `activeTab` te leunen vermijd je een brede
  host-permission alleen voor de capture. Praktisch betekent dit dat de capture
  getriggerd wordt vanuit een expliciete gebruikersactie (knop/hotkey), wat
  inhoudelijk toch al de bedoeling is.
- **Host-permissions voor de drie vaste bronnen — smal:** Nictiz-wiki (eenmalige
  `fetch` van het kwalificatiescript), GitHub raw-content (FHIR-fixtures) en
  het Anthropic API-domein (`api.anthropic.com`, vision-call) staan als
  concrete domeinen in `host_permissions`, niet als `<all_urls>`.
- **Content_scripts-matches (afwijking, expliciete gebruikerskeuze):** in
  plaats van het content script te beperken tot het PGO-domein (Ivido), draait
  het bewust op `<all_urls>`. Reden: het content script doet niets vanzelf —
  het reageert alleen op berichten van de side panel (§8.2) — en de gebruiker
  kan de extensie altijd uitzetten/deïnstalleren. Dit weegt voor deze PoC
  zwaarder dan de "zo smal mogelijk"-aanbeveling hierboven.
- **Trade-off/consequentie voor de toekomst:** zodra dit verder gaat dan de
  PoC van één gebruiker (§4.2, meerdere gebruikers/PGO's), is het opnieuw de
  moeite waard om dit tegen het licht te houden — bv. alsnog domeinspecifieke
  matches, of `optional_host_permissions` die de gebruiker per omgeving
  toestaat. Voor nu is `<all_urls>` een bewuste, geen per-ongeluk brede keuze.

### 8.9 Minimale foutafhandeling voor een bruikbare PoC

Doel: de sessie mag nooit stilvallen of onherstelbaar corrupt raken door een
verwachte, tijdelijke fout — zonder over-engineering voor schaal die er niet
is. Concreet, in volgorde van belang:

- **Claude API-timeout/-fout tijdens een sessie.** De vision-call wordt met
  een timeout en een paar retries met exponentiële backoff omgeven (429/5xx
  zijn tijdelijk en retrybaar). Faalt hij alsnog, dan **degradeert de extensie
  netjes naar het DOM-matching-resultaat**: de gebruiker krijgt het voorstel
  dat DOM-matching al opleverde plus een duidelijke melding "AI-voorstel niet
  beschikbaar, controleer handmatig", en kan het bewijs gewoon vastleggen.
  Omdat de AI hier een vangnet is (§1.5), is dit een acceptabele degradatie en
  géén sessie-blokkade. Dit is precies waarom het AI-pad achter een contract
  zit dat een expliciet "mislukt"-resultaat kan teruggeven i.p.v. een exception
  die omhoog borrelt.
- **Ongeldige/ontbrekende API-key.** Vóór de eerste call een vriendelijke
  check; een 401 leidt naar een duidelijke verwijzing naar de options-pagina,
  niet naar een cryptische fout.
- **Wiki-/FHIR-fetch of -parse faalt bij sessiestart.** Dit is wél blokkerend
  voor het starten (zonder checklist geen sessie), dus hier een duidelijke,
  luide fout met de reden (netwerk vs. onherkenbare structuur) en de
  mogelijkheid het opnieuw te proberen — beter dan stilzwijgend doorgaan met
  een halve checklist.
- **Screenshot-capture faalt** (zeldzaam, bv. een beschermde pagina): melding +
  mogelijkheid opnieuw te triggeren; de sessie blijft intact.
- **Opslag-schrijffout / quota.** Onwaarschijnlijk met `unlimitedStorage`, maar
  de opslag-repository geeft fouten expliciet terug zodat de side panel kan
  waarschuwen i.p.v. bewijs "verliezen".

Bewust *niet* nu bouwen: cross-sessie-herstel na een browsercrash,
transactionele consistentie over gedeelde opslag, of retry-queues — dat hoort
bij de toekomstvisie (§4.2), niet bij een single-user PoC die in één keer
wordt afgerond (§6).

### 8.10 Risico's en aandachtspunten (het meest onzeker)

- **Broosheid van wiki-parsing.** Een wiki-pagina heeft geen stabiel contract;
  een kleine opmaakwijziging kan de tabel-parser breken. Mitigatie: defensief
  parsen op koppen/kolommen en luid falen. Dit blijft het wankelste onderdeel
  bij het "opnieuw" gebruiken over meerdere rondes/weken.
- **Fuzzy DOM-matching is waar het echte werk zit — en waar de meeste
  onzekerheid zit.** Hoeveel varianten (datumnotatie, code-vs-codetekst,
  naamvolgorde, vertaling) de PGO precies toont, weet je pas tegen de échte
  Ivido-omgeving. Reken op iteratie: eerst tegen de concrete pilot-data
  inregelen, matchregels per veldtype uitbreiden. De architectuur (matcher
  los, uitbreidbaar per veldtype) is hierop ingericht, maar de dekking is
  empirisch, niet vooraf te garanderen.
- **Coördinaat-nauwkeurigheid (devicePixelRatio, scroll, sticky elementen).**
  De kaders-net-verschoven-klasse fouten. Viewport-capture houdt dit
  beheersbaar; full-page-stitching zou het risico fors vergroten — reden
  temeer om dat buiten de PoC te houden.
- **Directe browser-aanroep met eigen key is bewust "unsafe".** Aanvaard voor
  de PoC (fictieve data, single-user), maar het is precies het stuk dat in de
  toekomstvisie moet verdwijnen achter een backend. Doordat het achter het
  `AiVisionProvider`-contract zit, is dat een vervanging en geen herbouw — maar
  het blijft een expliciet bekend schuldpunt.
- **Service-worker-levensduur.** Door de zware logica in de side panel te
  leggen omzeilen we het grootste MV3-valkuil, maar het blijft opletten dat er
  geen langlopend werk per ongeluk in de worker belandt.
- **Escalatieladder tussen goedkoop en duur model** (§8.4) is nieuw en
  ongetest: de triggers (weinig DOM-matches, laag zelf-vertrouwen,
  schema-mismatch) moeten in de praktijk nog blijken de juiste balans te
  raken tussen kosten en kwaliteit.
- **Aanname over scenario 3 (herleiding) hergebruikt dataset 1.1** is nog te
  verifiëren (§1.5); dat is inhoud, niet architectuur, maar het raakt wél de
  checklist-opbouw en dus wat de matcher moet vinden.

### 8.11 Voorgestelde bestandsstructuur (bij implementatie)

Dit is een greenfield-project; onderstaande bestanden bestaan nog niet maar
zijn de fundamenten die deze architectuur verankeren:

- `manifest.json` — MV3-manifest: permissies, smalle host-permissions, de vier
  entrypoints (§8.2, §8.8).
- `src/storage/repositories.ts` — de opslag-contracten
  (`AnnotationRepository`, `SessionEvidenceStore`, `SettingsRepository`) met de
  IndexedDB-implementatie erachter; de kern van de §4.2-vervangbaarheid
  (§8.6).
- `src/ai/aiVisionProvider.ts` — het `AiVisionProvider`-contract + de
  fetch-implementatie naar `api.anthropic.com` (incl. de
  browser-access-header en foutdegradatie) (§8.4, §8.9).
- `src/content/domMatcher.ts` — DOM-tekst-indexering, fuzzy-matching per
  veldtype, en coördinaat-teruggave incl. devicePixelRatio (§8.3).
- `src/report/reportGenerator.ts` — de HTML+JSON-generator en de
  zip-/download-stap (§8.7).
