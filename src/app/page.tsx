import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <p className="mb-3 text-sm font-medium tracking-wide text-[var(--text-muted)] uppercase">
        Higher-Ed Database
      </p>
      <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
        Explore colleges, universities, and graduate schools with real IPEDS data
      </h1>
      <p className="mt-5 max-w-xl text-lg text-[var(--text-secondary)]">
        Search thousands of U.S. institutions and dig into enrollment, admissions,
        cost, finance, and graduation outcomes over time.
      </p>

      <form action="/institutions" className="mt-10 flex w-full max-w-md gap-2">
        <input
          type="text"
          name="q"
          placeholder="Search by institution name…"
          className="flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--series-1)]"
        />
        <button
          type="submit"
          className="rounded-md bg-[var(--series-1)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
        >
          Search
        </button>
      </form>

      <Link
        href="/institutions"
        className="mt-6 text-sm text-[var(--series-1)] hover:underline"
      >
        Browse all institutions →
      </Link>
    </div>
  );
}
