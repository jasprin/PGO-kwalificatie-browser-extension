interface ReportDoneStepProps {
  onBack: () => void;
}

export function ReportDoneStep({ onBack }: ReportDoneStepProps) {
  return (
    <div>
      <p>Rapport gedownload. Controleer het en verstuur het zelf naar het kwalificatiecentrum.</p>
      <button onClick={onBack}>Terug naar sessie</button>
    </div>
  );
}
