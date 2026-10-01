/** Skeleton shown while a page's data loads. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse px-4 py-10 sm:px-6" aria-busy="true" aria-label="Loading">
      <div className="h-4 w-32 rounded bg-sunken" />
      <div className="mt-3 h-14 w-72 max-w-full rounded bg-sunken" />
      <div className="mt-8 h-48 rounded-xl bg-sunken" />
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-40 rounded-xl bg-sunken" />
        ))}
      </div>
    </div>
  );
}
