export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function SkeletonCard() {
  return (
    <div className="card skeleton-card">
      <Skeleton className="skeleton-line lg" />
      <Skeleton className="skeleton-line" />
      <Skeleton className="skeleton-line sm" />
    </div>
  );
}
