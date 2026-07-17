import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { settingsRepository } from "../storage/repositories";

function OptionsApp() {
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    settingsRepository.getApiKey().then((key) => {
      if (key) setApiKey(key);
    });
  }, []);

  async function handleSave() {
    await settingsRepository.setApiKey(apiKey.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
        />
      </label>
      <button onClick={handleSave}>Opslaan</button>
      {saved && <span style={{ marginLeft: "0.5rem", color: "green" }}>Opgeslagen.</span>}
    </div>
  );
}

const root = document.getElementById("app");
if (root) {
  render(<OptionsApp />, root);
}
