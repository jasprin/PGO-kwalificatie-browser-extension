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

/** Bouwt een index van zichtbare tekstknopen onder `root` (§8.3). */
export function buildTextIndex(root: Element): TextIndexEntry[] {
  const doc = root.ownerDocument ?? document;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const text = node.textContent?.trim();
      if (!text) return NodeFilter.FILTER_REJECT;
      const parent = (node as Text).parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const style = doc.defaultView?.getComputedStyle(parent);
      if (style && (style.display === "none" || style.visibility === "hidden")) {
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

/**
 * Zoekt de beste match voor één testwaarde in de index. Oplopend:
 * 1. genormaliseerde exacte (sub)string-match
 * 2. voor coded values: code óf weergavetekst accepteren
 * 3. voor datums: T-offset omrekenen naar een absolute datum en een paar
 *    gangbare notaties proberen
 * 4. tolerante (Levenshtein-)afstand als vangnet
 */
export function matchTestValue(
  index: TextIndexEntry[],
  value: TestValue,
  tDate: string,
): MatchResult | undefined {
  const candidates = new Set<string>();
  candidates.add(value.normalized);
  if (value.displayText) candidates.add(normalizeText(value.displayText));
  if (value.kind === "code" && value.code) candidates.add(normalizeText(value.code));
  if (value.kind === "date" && value.tOffset) {
    const resolved = resolveTOffset(value.tOffset, tDate);
    if (resolved) {
      for (const candidate of candidateDateStrings(resolved)) {
        candidates.add(candidate);
      }
    }
  }

  // 1-3: exacte (sub)string-match tegen alle kandidaat-representaties, in
  // beide richtingen — een PGO kan een kortere/afgeknipte variant tonen dan
  // de volledige testwaarde (bv. zonder toedieningsvorm-achtervoegsel).
  for (const entry of index) {
    if (!entry.normalized) continue;
    for (const candidate of candidates) {
      if (candidate.length < 2) continue;
      if (
        entry.normalized.includes(candidate) ||
        candidate.includes(entry.normalized)
      ) {
        return { element: entry.element, confidence: 1 };
      }
    }
  }

  // 3b. Token-overlap: telt als match als een ruime meerderheid van de
  // betekenisvolle woorden (>2 tekens) van de waarde in de entry voorkomt —
  // vangt parafrases/afkortingen op die (nog) niet als losse substring matchen.
  for (const candidate of candidates) {
    const tokens = candidate.split(" ").filter((t) => t.length > 2);
    if (tokens.length < 2) continue;
    for (const entry of index) {
      if (!entry.normalized) continue;
      const matchedTokens = tokens.filter((t) => entry.normalized.includes(t));
      if (matchedTokens.length / tokens.length >= 0.7) {
        return {
          element: entry.element,
          confidence: matchedTokens.length / tokens.length,
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
