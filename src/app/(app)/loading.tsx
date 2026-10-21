export default function Loading() {
  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6 md:px-6">
      <div className="h-6 w-48 animate-pulse rounded bg-surface-2" />
      <div className="mt-2 h-4 w-72 animate-pulse rounded bg-surface-2" />
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-surface" />)}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-72 animate-pulse rounded-lg border border-border bg-surface" />)}
      </div>
    </div>
  );
}
