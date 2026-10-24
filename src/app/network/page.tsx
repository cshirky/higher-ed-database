import Link from "next/link";
import { NetworkPicker } from "./network-picker";
import { VIEWS } from "./view-list";

export default function NetworkIndexPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">College networks</h1>
      <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
        Start from one college you like. You&apos;ll see up to 20 others whose students earn degrees in a similar
        mix of majors, and that are as good or better on yield, graduation rate, and cost — drawn so you can tell
        which are bigger and which are smaller.
      </p>
      <div className="mt-6">
        <NetworkPicker view={VIEWS[0].slug} initial={null} />
      </div>
      <h2 className="mt-10 text-sm font-medium uppercase tracking-wide text-[var(--text-muted)]">Five ways to see it</h2>
      <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {VIEWS.map((v) => (
          <li key={v.slug} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <h3 className="text-sm font-semibold">{v.name}</h3>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{v.tagline}</p>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Pick a college above, or try it with{" "}
              <Link href={`/network/${v.slug}?id=204501`} className="underline hover:text-[var(--foreground)]">
                Oberlin
              </Link>
              .
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
