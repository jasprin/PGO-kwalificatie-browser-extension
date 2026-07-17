import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json";

// BELANGRIJK — TODO vóór gebruik (zie PLAN.md §8.8): "matches" hieronder is
// bewust breed (<all_urls>) omdat het exacte domein van PGO Ivido nog niet
// bekend is bij het opzetten van dit project. Vervang dit door het echte
// Ivido-domein zodra dat bekend is, conform de architectuurkeuze om zo smal
// mogelijke host-permissions te gebruiken.
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
