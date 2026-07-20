// DOM-tekst-matching (PLAN.md §7.1, §8.3): de "harde" detectiekant van het
// hybride mechanisme. Zoekt bekende testwaarden in de zichtbare paginatekst,
// met oplopende fuzzy-matching omdat een PGO een waarde anders opgemaakt kan
// tonen dan de rauwe testwaarde (andere datumnotatie, code i.p.v. codetekst,
// naamvolgorde, etc.).
//
// Bewust puur/testbaar gehouden: de index- en matchlogica hier heeft geen
// afhankelijkheid van chrome.*-API's, alleen van de DOM zelf. De koppeling
// met de extensie (berichten ontvangen, coördinaten omrekenen naar
// device-pixels) zit in content/index.ts.

import type { ChecklistItem, DomMatchResult, Rect, TestValue } from "../shared/types";
import { normalizeText, resolveTOffset } from "../sources/valueParsing";

export interface TextIndexEntry {
  element: Element;
  normalized: string;
}

/** Vindt een open modal/dialoog, als die er is (bv. een detailvenster dat
 * over de rest van de pagina heen ligt). Gevonden tijdens live-testen (§7.1):
 * de vorige, kale CSS-zichtbaarheidscheck (alleen display:none/
 * visibility:hidden) telde ook tekst mee die ergens anders op de (lange)
 * onderliggende paginastructuur staat maar niet in de daadwerkelijk getoonde
 * modal — dat gaf valse "100% gevonden"-matches voor velden die de gebruiker
 * helemaal niet op het scherm had. Staat er een modal open, dan is dát de
 * daadwerkelijke "huidige weergave", niet de hele pagina eronder. */
function findModalRoot(doc: Document): Element | undefined {
  const candidates = doc.querySelectorAll<HTMLElement>(
    'dialog[open], [role="dialog"], [aria-modal="true"]',
  );
  let best: HTMLElement | undefined;
  let bestZIndex = -Infinity;
  for (const candidate of candidates) {
    const rect = candidate.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const zIndex = Number.parseInt(
      doc.defaultView?.getComputedStyle(candidate).zIndex ?? "0",
      10,
    );
    const effectiveZIndex = Number.isNaN(zIndex) ? 0 : zIndex;
    if (effectiveZIndex >= bestZIndex) {
      bestZIndex = effectiveZIndex;
      best = candidate;
    }
  }
  return best;
}

/** Is dit element daadwerkelijk in beeld — niet alleen "geen display:none",
 * maar ook een niet-nul grootte binnen de viewport (vangt scrolled-away,
 * ingeklapte, of off-canvas content op die CSS-technisch wel "zichtbaar" is). */
function isWithinViewport(element: Element, win: Window): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  if (rect.bottom <= 0 || rect.right <= 0) return false;
  if (rect.top >= win.innerHeight || rect.left >= win.innerWidth) return false;
  return true;
}

/** Bouwt een index van zichtbare tekstknopen. Gebruikt automatisch een open
 * modal als matchgebied i.p.v. `root` zelf, als die aanwezig is (zie
 * `findModalRoot`). */
export function buildTextIndex(root: Element): TextIndexEntry[] {
  const doc = root.ownerDocument ?? document;
  const win = doc.defaultView ?? window;
  const effectiveRoot = findModalRoot(doc) ?? root;

  const walker = doc.createTreeWalker(effectiveRoot, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const text = node.textContent?.trim();
      if (!text) return NodeFilter.FILTER_REJECT;
      const parent = (node as Text).parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const style = win.getComputedStyle(parent);
      if (style.display === "none" || style.visibility === "hidden") {
        return NodeFilter.FILTER_REJECT;
      }
      if (!isWithinViewport(parent, win)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const entries: TextIndexEntry[] = [];
  let node: Node | null;
  // eslint-disable-next-line no-cond-assign
  while ((node = walker.nextNode())) {
    const parent = (node as Text).parentElement;
    if (!parent) continue;
    const text = node.textContent ?? "";
    entries.push({ element: parent, normalized: normalizeText(text) });
  }
  return entries;
}

/** Iteratieve Levenshtein-afstand (geen bibliotheek nodig voor deze schaal). */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dist = Array.from({ length: rows }, (_, i) => [
    i,
    ...Array(cols - 1).fill(0),
  ]);
  for (let j = 1; j < cols; j++) dist[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dist[i][j] = Math.min(
        dist[i - 1][j] + 1,
        dist[i][j - 1] + 1,
        dist[i - 1][j - 1] + cost,
      );
    }
  }
  return dist[rows - 1][cols - 1];
}

const DUTCH_MONTHS = [
  "januari", "februari", "maart", "april", "mei", "juni",
  "juli", "augustus", "september", "oktober", "november", "december",
];

/** Genereert een paar gangbare NL-datumnotaties voor eenzelfde datum, zodat
 * matching niet afhankelijk is van precies één format (§7.1/§8.3). */
function candidateDateStrings(date: Date): string[] {
  const d = date.getDate();
  const m = date.getMonth();
  const y = date.getFullYear();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return [
    `${pad(d)}-${pad(m + 1)}-${y}`,
    `${d}-${m + 1}-${y}`,
    `${pad(d)}/${pad(m + 1)}/${y}`,
    `${d} ${DUTCH_MONTHS[m]} ${y}`,
  ].map(normalizeText);
}

export interface MatchResult {
  element: Element;
  confidence: number;
}

/** Kandidaten korter dan dit worden niet als kale substring geaccepteerd
 * (issue #19) — een fragment van 2-3 tekens (bv. een ISO-landcode) komt op
 * een contentrijke pagina zo vaak toevallig voor dat het geen betekenisvol
 * signaal is. Zulke korte kandidaten moeten in plaats daarvan op een
 * woordgrens matchen (zie matchesAsWord). */
const MIN_SUBSTRING_CANDIDATE_LENGTH = 4;

/** Ondergrens voor de averechtse matchrichting (issue #20): "de kandidaat
 * bevat deze paginatekst" mag alleen tellen als die paginatekst zelf al
 * substantieel is — anders "bevestigt" een kort, generiek stukje paginatekst
 * (bv. een knoplabel) toevallig elke langere kandidaat waar het in voorkomt. */
const MIN_REVERSE_MATCH_ENTRY_LENGTH = 6;

/** Confidence voor een match die alleen via een generieke representatie
 * (zie Candidate.specific) tot stand kwam — laag genoeg om onder
 * AUTO_CONFIRM_CONFIDENCE_THRESHOLD (sessionController.ts) te blijven, zodat
 * zo'n element wél getoond maar niet automatisch aangevinkt wordt. */
const GENERIC_MATCH_CONFIDENCE = 0.6;

function matchesAsWord(haystack: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`).test(haystack);
}

interface Candidate {
  text: string;
  /** false voor een generieke representatie die niets patiënt-/scenario-
   * specifieks bewijst — met name de weergavetekst (bv. productnaam) van een
   * coded value, die voor élke patiënt met hetzelfde product gelijk is
   * (issue #21). Bij andere kinds is displayText juist wél de specifieke
   * waarde zelf (zie buildTestValue). */
  specific: boolean;
}

/**
 * Zoekt de beste match voor één testwaarde in de index. Oplopend:
 * 1. genormaliseerde exacte (sub)string-match
 * 2. voor coded values: code óf weergavetekst accepteren (weergavetekst
 *    telt als generiek, zie Candidate.specific)
 * 3. voor datums: T-offset omrekenen naar een absolute datum en een paar
 *    gangbare notaties proberen
 * 4. tolerante (Levenshtein-)afstand als vangnet
 */
export function matchTestValue(
  index: TextIndexEntry[],
  value: TestValue,
  tDate: string,
): MatchResult | undefined {
  // Specifieke kandidaten eerst: als voor dezelfde pagina-tekst zowel een
  // specifieke als een generieke representatie zou matchen, wint de
  // specifieke (confidence 1) omdat de binnenste lus per entry stopt bij de
  // eerste treffer. Let op: bij kind "code" is value.normalized zelf al
  // afgeleid van de generieke weergavetekst (zie buildTestValue), dus die
  // telt dan óók als generiek — alleen de code zelf is dan specifiek.
  const candidates: Candidate[] = [];
  if (value.kind === "code" && value.code) {
    candidates.push({ text: normalizeText(value.code), specific: true });
  }
  candidates.push({ text: value.normalized, specific: value.kind !== "code" });
  if (value.kind === "date" && value.tOffset) {
    const resolved = resolveTOffset(value.tOffset, tDate);
    if (resolved) {
      for (const text of candidateDateStrings(resolved)) {
        candidates.push({ text, specific: true });
      }
    }
  }
  if (value.displayText) {
    candidates.push({
      text: normalizeText(value.displayText),
      specific: value.kind !== "code",
    });
  }

  // 1-3: exacte (sub)string-match tegen alle kandidaat-representaties, in
  // beide richtingen — een PGO kan een kortere/afgeknipte variant tonen dan
  // de volledige testwaarde (bv. zonder toedieningsvorm-achtervoegsel).
  for (const entry of index) {
    if (!entry.normalized) continue;
    for (const candidate of candidates) {
      const text = candidate.text;
      if (text.length < 2) continue;

      const forwardMatch =
        text.length >= MIN_SUBSTRING_CANDIDATE_LENGTH
          ? entry.normalized.includes(text)
          : matchesAsWord(entry.normalized, text);
      const reverseMatch =
        entry.normalized.length >= MIN_REVERSE_MATCH_ENTRY_LENGTH &&
        text.includes(entry.normalized);

      if (forwardMatch || reverseMatch) {
        return {
          element: entry.element,
          confidence: candidate.specific ? 1 : GENERIC_MATCH_CONFIDENCE,
        };
      }
    }
  }

  // 3b. Token-overlap: telt als match als een ruime meerderheid van de
  // betekenisvolle woorden (>2 tekens) van de waarde in de entry voorkomt —
  // vangt parafrases/afkortingen op die (nog) niet als losse substring matchen.
  for (const candidate of candidates) {
    const tokens = candidate.text.split(" ").filter((t) => t.length > 2);
    if (tokens.length < 2) continue;
    for (const entry of index) {
      if (!entry.normalized) continue;
      const matchedTokens = tokens.filter((t) => entry.normalized.includes(t));
      const tokenRatio = matchedTokens.length / tokens.length;
      if (tokenRatio >= 0.7) {
        return {
          element: entry.element,
          confidence: candidate.specific
            ? tokenRatio
            : Math.min(tokenRatio, GENERIC_MATCH_CONFIDENCE),
        };
      }
    }
  }

  // 4. Tolerante afstand, alleen voor kortere waarden (namen/codes) — bij
  // lange vrije tekst levert dit te veel valse positieven op.
  const primary = value.normalized;
  if (primary.length >= 3 && primary.length <= 40) {
    let best: MatchResult | undefined;
    for (const entry of index) {
      if (Math.abs(entry.normalized.length - primary.length) > 5) continue;
      const distance = levenshtein(primary, entry.normalized.slice(0, primary.length + 5));
      const maxAllowed = Math.max(1, Math.floor(primary.length * 0.2));
      if (distance <= maxAllowed) {
        const confidence = 1 - distance / (maxAllowed + 1);
        if (!best || confidence > best.confidence) {
          best = { element: entry.element, confidence };
        }
      }
    }
    if (best) return best;
  }

  return undefined;
}

/** Rekent een elementrect om naar device-pixels (§8.3: devicePixelRatio is
 * load-bearing voor de latere canvas-markering). */
export function elementRectInDevicePixels(element: Element, dpr: number): Rect {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.x * dpr,
    y: rect.y * dpr,
    width: rect.width * dpr,
    height: rect.height * dpr,
  };
}

export function findMatchesForChecklist(
  root: Element,
  items: ChecklistItem[],
  tDate: string,
  devicePixelRatio: number,
): DomMatchResult[] {
  const index = buildTextIndex(root);
  const results: DomMatchResult[] = [];
  for (const item of items) {
    if (!item.expectedValue) continue;
    const match = matchTestValue(index, item.expectedValue, tDate);
    if (match) {
      results.push({
        checklistItemId: item.id,
        rect: elementRectInDevicePixels(match.element, devicePixelRatio),
        confidence: match.confidence,
      });
    }
  }
  return results;
}
