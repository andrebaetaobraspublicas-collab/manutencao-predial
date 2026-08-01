export function LoadingPanel({ label = 'Carregando informações…' }: { label?: string }) {
  return (
    <div className="loading-panel" role="status" aria-live="polite">
      <div>
        <div className="spinner" />
        <span>{label}</span>
      </div>
    </div>
  );
}
