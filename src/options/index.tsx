import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { settingsRepository } from "../storage/repositories";

function OptionsApp() {
  // Bewust NOOIT de daadwerkelijke opgeslagen key terug in dit veld laden
  // (security-review-bevinding, issue #27): dat zou de key onnodig lang in
  // JS-geheugen/DOM houden bij elk bezoek aan deze pagina. In plaats daarvan
  // alleen bijhouden of er al een key is (voor de placeholder/verwijderknop),
  // en het veld leeg laten tot de gebruiker zelf iets nieuws invoert.
  const [apiKey, setApiKey] = useState("");
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    settingsRepository.getApiKey().then((key) => {
      setHasStoredKey(Boolean(key));
    });
  }, []);

  async function handleSave() {
    const trimmed = apiKey.trim();
    if (!trimmed) return;
    await settingsRepository.setApiKey(trimmed);
    setApiKey("");
    setHasStoredKey(true);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleClear() {
    await settingsRepository.clearApiKey();
    setApiKey("");
    setHasStoredKey(false);
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "1rem", maxWidth: "480px" }}>
      <h1 style={{ fontSize: "16px" }}>Instellingen</h1>
      <p>
        Voer je eigen Claude API-key in. Deze wordt lokaal opgeslagen (§4.1: PoC,
        single-user) en gebruikt voor de AI-vision-herkenning tijdens een
        kwalificatiesessie.
      </p>
      <label>
        Claude API-key
        <input
          type="password"
          style={{ width: "100%" }}
          value={apiKey}
          onInput={(e) => setApiKey((e.target as HTMLInputElement).value)}
          placeholder={
            hasStoredKey ? "•••••••• (ingesteld — laat leeg om te behouden)" : "sk-ant-..."
          }
        />
      </label>
      <button onClick={handleSave} disabled={!apiKey.trim()}>
        Opslaan
      </button>
      {hasStoredKey && (
        <button
          onClick={handleClear}
          style={{ marginLeft: "0.5rem", color: "#b00020" }}
        >
          Verwijderen
        </button>
      )}
      {saved && <span style={{ marginLeft: "0.5rem", color: "green" }}>Opgeslagen.</span>}
    </div>
  );
}

const root = document.getElementById("app");
if (root) {
  render(<OptionsApp />, root);
}
