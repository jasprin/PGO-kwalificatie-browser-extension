import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json";

// Bewust <all_urls> (afwijking van de "zo smal mogelijk"-aanbeveling uit
// PLAN.md §8.8, expliciete gebruikerskeuze): het content script doet toch
// niets vanzelf — het reageert alleen op berichten van de side panel — en
// de gebruiker kan de extensie altijd uitzetten/deïnstalleren. Geen
// domeinspecifieke matches nodig.
const PGO_MATCHES = ["<all_urls>"];

const ICONS = {
  16: "src/assets/icons/icon-16.png",
  32: "src/assets/icons/icon-32.png",
  48: "src/assets/icons/icon-48.png",
  128: "src/assets/icons/icon-128.png",
};

export default defineManifest({
  manifest_version: 3,
  name: "PGO kwalificatie extension",
  version: pkg.version,
  description:
    "Helpt PGO-leveranciers bij het MedMij-kwalificatietraject (systeemrol Raadplegen) door bewijs-screenshots te markeren en een zelfverklarend rapport te genereren.",
  action: {
    default_title: "PGO kwalificatie extension",
    default_icon: ICONS,
  },
  icons: ICONS,
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
  // Bewust <all_urls> i.p.v. losse domeinen (zelfde afweging als de
  // content_scripts-matches hierboven): chrome.tabs.captureVisibleTab()
  // vereist activeTab (alleen geactiveerd door een klik op het
  // werkbalk-icoon/hotkey/contextmenu, NIET door een knop binnenin een al
  // geopend side panel) of een host-permissie voor de pagina. Omdat "hier is
  // bewijs" primair een side panel-knop is, moet de host-permissie het
  // werk doen — <all_urls> dekt dat voor elke PGO, ongeacht domein.
  host_permissions: ["<all_urls>"],
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
