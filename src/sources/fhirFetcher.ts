// Ophalen van de publieke FHIR-testfixtures (PLAN.md §1.6, §8.5).
// Rol is bewust beperkt: de wiki (wikiParser.ts) bepaalt welke checklist-items
// er zijn en levert al bruikbare testwaarden; deze fixtures dienen puur als
// aanvullende/verrijkende waarde-opzoekbron (bv. om te bevestigen dat een wiki-
// waarde ook echt zo in de FHIR-data staat, of om een alternatieve notatie
// van dezelfde waarde te vinden). Geen FHIR-pad-naar-checklist-item-mapping
// (§1.6: koppeling via gedeelde waarde, niet via hardgecodeerd pad).
//
// Bron-locatie is instelbaar (niet hardcoded naar Nictiz, §1.6) omdat MedMij
// tegenwoordig ook zelf gegevensdiensten publiceert.

import { normalizeText } from "./valueParsing";

export interface FhirFixtureSource {
  /** GitHub API contents-URL, bv. .../repos/Nictiz/Nictiz-testscripts/contents/src/Immunization-2-0/Cert/_reference/resources */
  contentsApiUrl: string;
}

export const PILOT_FHIR_SOURCE: FhirFixtureSource = {
  contentsApiUrl:
    "https://api.github.com/repos/Nictiz/Nictiz-testscripts/contents/src/Immunization-2-0/Cert/_reference/resources",
};

interface GitHubContentEntry {
  name: string;
  download_url: string;
}

export async function listFhirFixtureFiles(
  source: FhirFixtureSource = PILOT_FHIR_SOURCE,
): Promise<GitHubContentEntry[]> {
  const response = await fetch(source.contentsApiUrl, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) {
    throw new Error(
      `Kon FHIR-testfixture-lijst niet ophalen (HTTP ${response.status})`,
    );
  }
  return response.json();
}

/** Haalt alle fixture-bestanden op en cachet ze als platte tekst, in het
 * geheugen voor de duur van de sessie (geen persistente opslag nodig). */
export class FhirFixtureCache {
  private files: Map<string, string> | undefined;

  constructor(private readonly source: FhirFixtureSource = PILOT_FHIR_SOURCE) {}

  private async ensureLoaded(): Promise<Map<string, string>> {
    if (this.files) return this.files;
    const entries = await listFhirFixtureFiles(this.source);
    const xmlEntries = entries.filter((e) => e.name.endsWith(".xml"));
    const contents = await Promise.all(
      xmlEntries.map(async (entry) => {
        const res = await fetch(entry.download_url);
        return [entry.name, await res.text()] as const;
      }),
    );
    this.files = new Map(contents);
    return this.files;
  }

  /**
   * Zoekt of een genormaliseerde waarde ergens in de opgehaalde fixtures
   * voorkomt. Puur tekst-gebaseerd (§1.6: koppeling via gedeelde waarde) —
   * geen XML-structuur-analyse. Geeft de bestandsnamen terug waarin de
   * waarde is gevonden, t.b.v. verrijking/validatie van een checklist-item.
   */
  async findValueOccurrences(rawValue: string): Promise<string[]> {
    const files = await this.ensureLoaded();
    const needle = normalizeText(rawValue);
    if (!needle) return [];
    const matches: string[] = [];
    for (const [name, text] of files) {
      if (normalizeText(text).includes(needle)) {
        matches.push(name);
      }
    }
    return matches;
  }
}
