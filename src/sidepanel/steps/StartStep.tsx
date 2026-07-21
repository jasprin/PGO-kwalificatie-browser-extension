interface StartStepProps {
  scriptUrl: string;
  onScriptUrlChange: (value: string) => void;
  tDate: string;
  onTDateChange: (value: string) => void;
  busy: boolean;
  onStart: () => void;
}

export function StartStep({
  scriptUrl,
  onScriptUrlChange,
  tDate,
  onTDateChange,
  busy,
  onStart,
}: StartStepProps) {
  return (
    <div>
      <label>
        Kwalificatiescript-URL
        <input
          style={{ width: "100%" }}
          value={scriptUrl}
          onInput={(e) => onScriptUrlChange((e.target as HTMLInputElement).value)}
          placeholder="https://informatiestandaarden.nictiz.nl/wiki/..."
        />
      </label>
      <label>
        T-datum (voorstel: maandag van deze week — corrigeer indien nodig)
        <input
          type="date"
          value={tDate}
          onInput={(e) => onTDateChange((e.target as HTMLInputElement).value)}
        />
      </label>
      <button disabled={busy || !scriptUrl} onClick={onStart}>
        Sessie starten
      </button>
    </div>
  );
}
