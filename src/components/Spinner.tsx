export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="spinner-wrap" role="status" aria-label={label}>
      <div className="spinner" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
