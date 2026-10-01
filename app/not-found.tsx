import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-widest text-accent-ink">Offside</p>
      <h1 className="display-hero mt-2 text-6xl">Page not found</h1>
      <p className="mt-4 text-lg text-fg-muted">That page, player or game doesn&apos;t exist.</p>
      <Link href="/" className="btn btn-primary mt-8">
        Back home
      </Link>
    </div>
  );
}
