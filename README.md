# PGO kwalificatie extension

Browserextensie die PGO-leveranciers helpt bij het MedMij-kwalificatietraject
voor systeemrol **Raadplegen**. Tijdens het testen van de eigen PGO legt de
leverancier bewijs vast (screenshots); de extensie herkent welke verplichte
data-elementen zichtbaar zijn (hybride: DOM-tekst-matching + Claude
vision-AI als vangnet), markeert ze genummerd op het beeld, en bouwt
daaruit een zelfverklarend HTML-rapport + checklist, verpakt in een zip.

Doel: minder verduidelijkingsrondes met het kwalificatiecentrum, door een
eerste inzending te leveren die een beoordelaar die de PGO niet kent
zelfstandig kan doorlopen.

Voor de volledige requirements, flow en architectuur-onderbouwing: zie
[`PLAN.md`](./PLAN.md).

## Status

**Proof of concept**, single-user. Gebouwd en getest tegen één concrete
MedMij-gegevensdienst (Vaccinatie-Immunisatie Raadplegen) en één PGO
(Ivido). Nog **niet** live getest in een echte browser tegen een echte
Claude API-key — zie [Testen](#testen) hieronder voor precies wat wel/niet
is geverifieerd.

## Vereisten

- Node.js 24+ en npm
- Een Chromium-gebaseerde browser (Chrome, Edge, Brave, ...) — Manifest V3
- Een eigen Claude API-key (voor de AI-vision-herkenning)

## Installeren en bouwen

```bash
npm install
npm run build
```

Dit vult de map `dist/` met de kant-en-klare extensie.

## De extensie laden als unpacked extensie

1. Open `chrome://extensions` (of het Edge/Brave-equivalent).
2. Zet **"Ontwikkelaarsmodus"** aan (rechtsboven).
3. Klik **"Uitgepakte extensie laden"** en kies de `dist/`-map.
4. Het extensie-icoon verschijnt in de werkbalk.

Voor iteratief ontwikkelen met hot-reload: `npm run dev` in plaats van
`npm run build` (CRXJS herlaadt de extensie automatisch bij wijzigingen —
je moet 'm nog wel één keer als unpacked extensie laden).

## Instellen

Rechtermuisklik op het extensie-icoon → **Opties** (of via
`chrome://extensions` → Details → "Extensieopties") en vul je Claude
API-key in.

## Gebruiken

1. Klik op het extensie-icoon — de side panel opent.
2. Plak de URL van het kwalificatiescript (Nictiz-wiki) van de
   gegevensdienst, controleer/corrigeer de voorgestelde T-datum, klik
   "Sessie starten".
3. Navigeer naar de PGO. Zodra relevante data in beeld staat: klik "Hier is
   bewijs" (of gebruik de hotkey **Ctrl+Shift+E** / **Cmd+Shift+E**).
4. Controleer/corrigeer het voorstel (scenario + zichtbare elementen) en
   bevestig.
5. Herhaal 3–4 zo vaak als nodig. Klik daarna "Naar overzicht" om te zien
   welke data-elementen nog ontbreken en eventueel een toelichting toe te
   voegen — je kunt van hieruit altijd terug naar stap 3 binnen dezelfde
   sessie.
6. Klik "Rapport genereren" voor de gedownloade zip (HTML-rapport +
   screenshots + metadata). Verstuur deze zelf naar het
   kwalificatiecentrum — de extensie doet dit niet automatisch.

## Testen

```bash
npm test
```

Draait de handmatige regressietests in `tests/` (geen testframework zoals
Jest/Vitest — bewust minimaal voor een PoC):

- `wikiParser.test.mjs` — tegen een **echt opgehaalde**
  kwalificatiescript-pagina (`tests/fixtures/`).
- `domMatcher.test.mjs` — tegen een synthetische testpagina (jsdom).
- `reportGenerator.test.mjs` — zip-structuur, HTML-ankers, metadata.
- `tDate.test.mjs` — het T-datum-algoritme.

Typecheck: `npx tsc --noEmit`.

**Nog niet getest** (vereist een echte browser en/of een echte API-key):
AI-vision-aanroep (`src/ai/aiVisionProvider.ts`), screenshot-capture en
canvas-markering (`src/capture/screenshot.ts`), de chrome.*-messaging in
`src/background/` en `src/content/index.ts`, en de side panel
(`src/sidepanel/`) die alles samenbrengt. De volledige flow is nog nooit
end-to-end in een browser gedraaid.

## Architectuur (kort)

- **Manifest V3**, TypeScript, gebouwd met Vite + `@crxjs/vite-plugin`,
  UI in Preact.
- **Side panel** (`src/sidepanel/`) is de orchestrator: sessie-state,
  wiki/FHIR-fetch, AI-aanroep, rapportgeneratie.
- **Content script** (`src/content/`) levert alleen DOM-feiten (fuzzy
  tekst-matching + coördinaten) terug aan de side panel.
- **Background service worker** (`src/background/`) is een dunne router:
  hotkey-afhandeling en side panel openen.
- **Opslag** (`src/storage/`) via IndexedDB, achter een
  repository-patroon (`AnnotationRepository`, `SessionEvidenceStore`,
  `SettingsRepository`) zodat een latere gedeelde/centrale opslag de rest
  van de extensie niet hoeft te raken.
- **Bronnen** (`src/sources/`): de Nictiz-wiki bepaalt welke checklist-items
  er zijn; publieke FHIR-testfixtures op GitHub dienen als aanvullende
  waarde-opzoekbron.

Volledige onderbouwing en alle afwegingen: [`PLAN.md` §8](./PLAN.md).

## Bekende beperkingen

- Content script draait bewust op `<all_urls>` (geen domeinspecifieke
  match voor de PGO) — zie `manifest.config.ts`.
- Geen retries-met-backoff of blokkerende foutafhandeling bij een mislukte
  wiki/FHIR-fetch (zie GitHub-issue voor foutafhandeling).
- Enkel geverifieerd voor de gegevensdienst Vaccinatie-Immunisatie
  Raadplegen.
