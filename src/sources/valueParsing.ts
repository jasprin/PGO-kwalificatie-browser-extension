// Parsing-hulp voor de "Waarde"-kolom van de Nictiz-wiki-testdatatabellen.
// Patronen hieronder zijn afgeleid van de daadwerkelijke wiki-pagina voor
// Vaccinatie-Immunisatie Raadplegen (§1.5), niet verzonnen — zie bv.:
//   "COVID-19 VACCIN ASTRAZENECA INJVLST (code = '2925508' in codeSystem 'G-Standaard HPK')"
//   "999900353 (in identificerend systeem: BSN)"
//   "T - 68 jaar"

import type { TestValue } from "../shared/types";

export function normalizeText(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // diakrieten weg
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const CODE_PATTERN =
  /^(.*?)\s*\(code\s*=\s*'([^']+)'\s*in\s*codeSystem\s*'([^']+)'\)\s*$/i;

const IDENTIFIER_PATTERN =
  /^(.*?)\s*\(in\s*identificerend\s*systeem:\s*([^)]+)\)\s*$/i;

/** bv. "T - 68 jaar", "T-100", "T + 3 weken". */
const T_OFFSET_PATTERN =
  /^T\s*([+-])\s*(\d+)\s*(dag(?:en)?|week(?:en)?|maand(?:en)?|jaar|jaren)?\s*$/i;

export interface ParsedValue {
  kind: TestValue["kind"];
  displayText?: string;
  codeSystem?: string;
  code?: string;
  tOffset?: string;
}

/**
 * Leidt een globale "soort" + eventuele structuur af uit de rauwe
 * wiki-waarde-tekst. Dit is een heuristiek (§8.10: dekking pas empirisch
 * te bepalen) — bij twijfel valt hij terug op "text".
 */
export function inferValueKind(rawValue: string, label: string): ParsedValue {
  const value = rawValue.trim();

  const tMatch = value.match(T_OFFSET_PATTERN);
  if (tMatch) {
    return { kind: "date", tOffset: value };
  }

  const codeMatch = value.match(CODE_PATTERN);
  if (codeMatch) {
    return {
      kind: "code",
      displayText: codeMatch[1].trim(),
      code: codeMatch[2].trim(),
      codeSystem: codeMatch[3].trim(),
    };
  }

  const idMatch = value.match(IDENTIFIER_PATTERN);
  if (idMatch) {
    return { kind: "identifier", displayText: idMatch[1].trim() };
  }

  const normalizedLabel = normalizeText(label);
  if (/naam|achternaam|voornaam|voorvoegsel/.test(normalizedLabel)) {
    return { kind: "name" };
  }

  return { kind: "text" };
}

/**
 * Rekent een T-offset-tekst (bv. "T - 68 jaar") om naar een absolute datum,
 * gegeven de T-datum van de sessie (§7.1 T-datum-algoritme).
 * Geeft `undefined` als de tekst niet als T-offset herkend wordt.
 */
export function resolveTOffset(tOffsetText: string, tDate: string): Date | undefined {
  const match = tOffsetText.match(T_OFFSET_PATTERN);
  if (!match) return undefined;

  const sign = match[1] === "-" ? -1 : 1;
  const amount = Number.parseInt(match[2], 10) * sign;
  const unit = (match[3] ?? "dag").toLowerCase();

  const base = new Date(`${tDate}T00:00:00`);
  if (unit.startsWith("dag")) {
    base.setDate(base.getDate() + amount);
  } else if (unit.startsWith("week")) {
    base.setDate(base.getDate() + amount * 7);
  } else if (unit.startsWith("maand")) {
    base.setMonth(base.getMonth() + amount);
  } else if (unit.startsWith("jaar")) {
    base.setFullYear(base.getFullYear() + amount);
  }
  return base;
}

export function buildTestValue(rawValue: string, label: string): TestValue {
  const parsed = inferValueKind(rawValue, label);
  return {
    raw: rawValue,
    normalized: normalizeText(parsed.displayText ?? rawValue),
    kind: parsed.kind,
    codeSystem: parsed.codeSystem,
    code: parsed.code,
    displayText: parsed.displayText,
    tOffset: parsed.tOffset,
  };
}
