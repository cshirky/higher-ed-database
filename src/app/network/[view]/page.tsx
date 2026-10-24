import Link from "next/link";
import { notFound } from "next/navigation";
import { getCollegeNetwork, DEFAULT_YEAR, academicYearLabel } from "@/db/queries";
import { AXES, COLLAR_MAJORS, COLLAR_MAJOR_SHARE, COST_TOLERANCE, NETWORK_SIZE } from "@/lib/college-network";
import { RATE_TOLERANCE } from "@/lib/rate-tolerance";
import { NetworkPicker } from "../network-picker";
import { NetworkTable } from "../network-table";
import { VIEWS, isViewSlug, type ViewSlug } from "../view-list";
import { AfterMount } from "../_views/after-mount";
import { CultureView } from "../_views/culture";
import { QuestView } from "../_views/quest";
import { TransitView } from "../_views/transit";
import { StarsView } from "../_views/stars";
import { CityView } from "../_views/city";

const DIAGRAMS: Record<ViewSlug, typeof CultureView> = {
  culture: CultureView,
  quest: QuestView,
  transit: TransitView,
  stars: StarsView,
  city: CityView,
};

/** "a", "a and b", "a, b, and c". */
function listOf(items: string[]) {
  return items.length <= 2 ? items.join(" and ") : `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function parseId(v: string | string[] | undefined) {
  return typeof v === "string" && /^\d{1,9}$/.test(v) ? Number(v) : null;
}

export default async function NetworkViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ view: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { view } = await params;
  if (!isViewSlug(view)) notFound();
  const id = parseId((await searchParams).id);
  const network = id != null ? await getCollegeNetwork(id) : null;
  const meta = VIEWS.find((v) => v.slug === view)!;
  const Diagram = DIAGRAMS[view];
  const target = network?.target;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <nav aria-label="Ways to see the network" className="flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <Link
            key={v.slug}
            href={`/network/${v.slug}${id != null ? `?id=${id}` : ""}`}
            aria-current={v.slug === view ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-sm ${
              v.slug === view
                ? "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]"
                : "border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--foreground)]"
            }`}
          >
            {v.name}
          </Link>
        ))}
      </nav>

      <h1 className="mt-6 text-2xl font-semibold tracking-tight">
        {target ? `The ${target.name} network` : "College network"}
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">{meta.tagline}</p>

      <div className="mt-5">
        {/* Keyed on the school, so the box resets when the URL changes under it. */}
        <NetworkPicker
          key={id ?? "none"}
          view={view}
          initial={target ? { unitid: target.unitid, name: target.name, city: null, state: target.state } : null}
        />
      </div>
      {id != null && !network && (
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          That link doesn&apos;t point to a four-year college in the {academicYearLabel(DEFAULT_YEAR)} data. Pick one
          above.
        </p>
      )}

      {network && (
        <>
          <p className="mt-6 max-w-3xl text-sm">
            {network.peers.length === 0 ? (
              <>No college with a similar mix of majors is as good or better on all three counts.</>
            ) : (
              <>
                <strong>{network.peers.length}</strong> college{network.peers.length === 1 ? "" : "s"} with a
                similar mix of majors, each also teaching {listOf(target!.topMajors.map((m) => m.toLowerCase()))},{" "}
                {network.peers.length === 1 ? "is" : "are"} the same or better on all of{" "}
                {AXES.map((a) => a.label.toLowerCase()).join(", ")}.
                {network.peers.length < NETWORK_SIZE && (
                  <span className="text-[var(--text-secondary)]">
                    {" "}
                    That&apos;s fewer than {NETWORK_SIZE}: few schools like this one beat it on every count.
                  </span>
                )}
              </>
            )}
            {AXES.some((a) => target!.verdicts[a.key] === "unknown") && (
              <span className="text-[var(--text-secondary)]">
                {" "}
                {target!.name} reports no{" "}
                {AXES.filter((a) => target!.verdicts[a.key] === "unknown")
                  .map((a) => a.label.toLowerCase())
                  .join(" or ")}
                , so nothing is compared on that.
              </span>
            )}
          </p>

          <div className="mt-4">
            <AfterMount minHeight={600}>
              <Diagram network={network} />
            </AfterMount>
          </div>

          <details className="mt-8">
            <summary className="cursor-pointer text-sm font-medium">See it as a table</summary>
            <NetworkTable network={network} view={view} />
          </details>

          <p className="mt-6 max-w-3xl text-xs text-[var(--text-muted)]">
            From IPEDS, academic year {academicYearLabel(DEFAULT_YEAR)} (sticker prices from the year before where
            this year&apos;s are not out yet). &ldquo;Similar mix of majors&rdquo; means close on the degrees students
            finish, subject by subject, and on how many. Only colleges a student choosing {target!.name} would also
            weigh are counted: each must award at least {COLLAR_MAJOR_SHARE * 100}% of its bachelor&apos;s degrees in
            every one of {target!.name}&apos;s {COLLAR_MAJORS} largest subjects; a special-focus school (a
            conservatory, art school, seminary, or the like) is compared only with schools of the same focus; and
            colleges with a strong religious mission are compared only with each other. Yield and graduation rate count as the same when they are
            less than {RATE_TOLERANCE} points apart; sticker price when it is within {COST_TOLERANCE * 100}%. Better
            cost means cheaper. Sticker price is before financial aid, and for public colleges is the average of the
            in-state and out-of-state prices.
          </p>
        </>
      )}
    </div>
  );
}
