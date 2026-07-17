import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json";

// Bewust <all_urls> (afwijking van de "zo smal mogelijk"-aanbeveling uit
// PLAN.md §8.8, expliciete gebruikerskeuze): het content script doet toch
// niets vanzelf — het reageert alleen op berichten van de side panel — en
// de gebruiker kan de extensie altijd uitzetten/deïnstalleren. Geen
// domeinspecifieke matches nodig.
const PGO_MATCHES = ["<all_urls>"];

export default defineManifest({
  manifest_version: 3,
  name: "PGO-kwalificatie Bewijsassistent",
  version: pkg.version,
  description:
    "Helpt PGO-leveranciers bij het MedMij-kwalificatietraject (systeemrol Raadplegen) door bewijs-screenshots te markeren en een zelfverklarend rapport te genereren.",
  action: {
    default_title: "PGO-kwalificatie Bewijsassistent",
  },
  side_panel: {
    default_path: "src/sidepanel/index.html",
  },
  options_page: "src/options/index.html",
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  content_scripts: [
    {
      matches: PGO_MATCHES,
      js: ["src/content/index.ts"],
      run_at: "document_idle",
    },
  ],
  permissions: ["sidePanel", "storage", "unlimitedStorage", "downloads", "activeTab", "commands"],
  host_permissions: [
    // Nictiz-wiki: ophalen van het kwalificatiescript (§1.5, §8.5)
    "https://informatiestandaarden.nictiz.nl/*",
    // Publieke FHIR-testfixtures (§1.6, §8.5): bestandslijst + ruwe inhoud
    "https://api.github.com/*",
    "https://raw.githubusercontent.com/*",
    // Claude vision-API (§8.4)
    "https://api.anthropic.com/*",
  ],
  commands: {
    "capture-evidence": {
      suggested_key: {
        default: "Ctrl+Shift+E",
        mac: "Command+Shift+E",
      },
      description: "Leg bewijs vast (screenshot + herkenning)",
    },
  },
});
