import Link from "next/link";
import { getTriangleProfiles, DEFAULT_YEAR, academicYearLabel } from "@/db/queries";
import { LOCALE_LABELS } from "@/lib/institution-types";
import {
  LETTERS,
  REGIONS,
  thingsByRegion,
  triangleThings,
  type Letter,
  type Region,
  type Thing,
  type TriangleProfile,
} from "@/lib/triangle";
import { LetterBadge } from "./letter-badge";
import { TrianglePicker, type PickedInstitution } from "./picker";
import { Venn } from "./venn";

// Majors listed before a region's list folds behind "Show more".
const MAJORS_SHOWN = 12;

// Where each region's card sits on wide screens: the three schools at the
// corners of a triangle, each pair on the edge between its two, and what all
// three share in the middle. Narrow screens stack them in REGIONS order.
const PLACEMENT: Record<Region, string> = {
  A: "lg:col-start-1 lg:row-start-1",
  AB: "lg:col-start-2 lg:row-start-1",
  B: "lg:col-start-3 lg:row-start-1",
  AC: "lg:col-start-1 lg:row-start-2",
  ABC: "lg:col-start-2 lg:row-start-2",
  BC: "lg:col-start-3 lg:row-start-2",
  C: "lg:col-start-2 lg:row-start-3",
};

function parseId(v: string | string[] | undefined) {
  return typeof v === "string" && /^\d{1,9}$/.test(v) ? Number(v) : null;
}

function joinNames(names: string[]) {
  return names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

export default async function TrianglePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const ids = LETTERS.map((l) => parseId(params[l.toLowerCase()]));
  const requested = ids.filter((id): id is number => id != null);
  const found = requested.length > 0 ? await getTriangleProfiles(requested) : [];
  const byId = new Map(found.map((p) => [p.unitid, p]));
  const picks = ids.map((id) => (id != null ? (byId.get(id) ?? null) : null));
  const missing = ids.some((id, i) => id != null && picks[i] == null);

  const initial: (PickedInstitution | null)[] = picks.map((p) =>
    p ? { unitid: p.unitid, name: p.name, city: p.city, state: p.state } : null,
  );
  const ready = picks.every((p) => p != null) && new Set(ids).size === 3;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Compare three colleges</h1>
      <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
        Pick three colleges you like. You&apos;ll see what all three have in common, what any two share that
        the third doesn&apos;t, and what makes each one different — from setting and size to the majors they
        offer.
      </p>

      <div className="mt-6">
        {/* Keyed on the picks, so the boxes reset when the URL changes under them. */}
        <TrianglePicker key={ids.join("-")} initial={initial} />
      </div>
      {missing && (
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          One of those links doesn&apos;t point to a four-year college in the {academicYearLabel(DEFAULT_YEAR)}{" "}
          data. Pick a replacement above.
        </p>
      )}

      {ready && <TriangleResult profiles={{ A: picks[0]!, B: picks[1]!, C: picks[2]! }} />}
    </div>
  );
}

function TriangleResult({ profiles }: { profiles: Record<Letter, TriangleProfile> }) {
  const byRegion = thingsByRegion(triangleThings(profiles));
  const name = (l: Letter) => profiles[l].name;

  const title = (r: Region) => {
    const members = r.split("") as Letter[];
    if (members.length === 3) return "All three";
    if (members.length === 1) return `Only ${name(members[0])}`;
    return `${name(members[0])} & ${name(members[1])}`;
  };
  const subtitle = (r: Region) => {
    const members = r.split("") as Letter[];
    if (members.length === 3) return "Things they all have in common";
    if (members.length === 1) return "Things neither of the others has";
    const other = LETTERS.find((l) => !members.includes(l))!;
    return `Things these two share, but not ${name(other)}`;
  };
  const counts = Object.fromEntries(REGIONS.map((r) => [r, byRegion[r].length])) as Record<Region, number>;
  const describe = (r: Region) => {
    const traits = byRegion[r].filter((t) => t.kind === "trait").length;
    const majors = byRegion[r].length - traits;
    return `${title(r)}: ${traits} trait${traits === 1 ? "" : "s"}, ${majors} major${majors === 1 ? "" : "s"}`;
  };

  return (
    <>
      <section className="mt-10 flex flex-col items-center gap-6 sm:flex-row sm:items-center">
        <Venn counts={counts} describe={describe} />
        <ul className="space-y-3 text-sm">
          {LETTERS.map((l) => (
            <li key={l} className="flex items-center gap-3">
              <LetterBadge letter={l} />
              <span>
                <Link href={`/institutions/${profiles[l].unitid}`} className="font-medium hover:underline">
                  {profiles[l].name}
                </Link>
                <span className="block text-[var(--text-muted)]">
                  {[profiles[l].city, profiles[l].state].filter(Boolean).join(", ")}
                </span>
              </span>
            </li>
          ))}
          <li className="pt-1 text-[var(--text-muted)]">
            The numbers count traits and majors in each part of the diagram. Click one to jump to it.
          </li>
        </ul>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {REGIONS.map((r) => (
          <RegionCard
            key={r}
            region={r}
            title={title(r)}
            subtitle={subtitle(r)}
            things={byRegion[r]}
            name={name}
            className={PLACEMENT[r]}
          />
        ))}
      </section>

      <SideBySide profiles={profiles} />

      <p className="mt-6 max-w-3xl text-xs text-[var(--text-muted)]">
        From IPEDS, academic year {academicYearLabel(DEFAULT_YEAR)} (sticker prices from the year before where
        this year&apos;s are not out yet). Numbers are grouped into ranges, so two colleges just either side of a
        line — admitting 24% and 26% — count as different; the table shows the actual figures. A major counts as
        offered when at least one student finished a bachelor&apos;s degree in it that year as a first major. ≈ marks
        a major the lettered college may teach under another name — Psychology, General at one school and Research
        and Experimental Psychology at another. Hover over it to see which.
      </p>
    </>
  );
}

function RegionCard({
  region,
  title,
  subtitle,
  things,
  name,
  className,
}: {
  region: Region;
  title: string;
  subtitle: string;
  things: Thing[];
  name: (l: Letter) => string;
  className: string;
}) {
  const members = region.split("") as Letter[];
  const traits = things.filter((t) => t.kind === "trait");
  const majors = things.filter((t) => t.kind === "major");
  const isAll = region === "ABC";

  return (
    <article
      id={`region-${region}`}
      className={`scroll-mt-6 rounded-lg border bg-[var(--surface)] p-4 ${
        isAll ? "border-[var(--text-muted)]" : "border-[var(--border)]"
      } ${className}`}
    >
      <header className="flex items-start gap-2">
        <span className="mt-0.5 flex -space-x-1">
          {members.map((l) => (
            <LetterBadge key={l} letter={l} size="sm" />
          ))}
        </span>
        <span className="min-w-0">
          <h2 className="text-sm font-semibold leading-snug">{title}</h2>
          <p className="text-xs text-[var(--text-muted)]">{subtitle}</p>
        </span>
      </header>

      {things.length === 0 && <p className="mt-3 text-sm text-[var(--text-muted)]">Nothing here.</p>}

      {traits.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {traits.map((t) => (
            <li key={t.key}>
              {t.label}
              <UnknownNote thing={t} name={name} />
            </li>
          ))}
        </ul>
      )}

      {majors.length > 0 && (
        <div className="mt-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
            Majors ({majors.length})
          </h3>
          <MajorList majors={majors.slice(0, MAJORS_SHOWN)} single={members.length === 1} name={name} />
          {majors.length > MAJORS_SHOWN && (
            <details className="mt-1">
              <summary className="cursor-pointer text-sm text-[var(--text-secondary)] hover:text-[var(--foreground)]">
                Show {majors.length - MAJORS_SHOWN} more
              </summary>
              <MajorList majors={majors.slice(MAJORS_SHOWN)} single={members.length === 1} name={name} />
            </details>
          )}
          <UnknownNote thing={majors[0]} name={name} block />
        </div>
      )}
    </article>
  );
}

function MajorList({ majors, single, name }: { majors: Thing[]; single: boolean; name: (l: Letter) => string }) {
  return (
    <ul className="mt-1 space-y-0.5 text-sm">
      {majors.map((m) => {
        const degrees = Object.entries(m.degrees ?? {}) as [Letter, number][];
        const tooltip = degrees.map(([l, n]) => `${name(l)}: ${n.toLocaleString()}`).join("\n");
        const related = m.relatedAt ?? [];
        return (
          <li key={m.key} title={`Bachelor's degrees in ${academicYearLabel(DEFAULT_YEAR)}\n${tooltip}`} className="flex justify-between gap-2">
            <span className="text-[var(--text-secondary)]">
              {m.label}
              {related.length > 0 && (
                <span
                  className="ml-1.5 inline-flex translate-y-[2px] items-center gap-0.5"
                  title={related.map((r) => `${name(r.letter)} offers ${joinNames(r.majors)}`).join("\n")}
                >
                  <span className="text-xs text-[var(--text-muted)]">≈</span>
                  {related.map((r) => (
                    <LetterBadge key={r.letter} letter={r.letter} size="xs" />
                  ))}
                </span>
              )}
            </span>
            {/* At one school a count says whether the major is big or a handful of students; across
                several, the per-school counts are in the tooltip. */}
            {single && <span className="shrink-0 tabular-nums text-[var(--text-muted)]">{degrees[0]?.[1].toLocaleString()}</span>}
          </li>
        );
      })}
    </ul>
  );
}

/** Says which schools report nothing for this, so their absence from a region is not read as a difference. */
function UnknownNote({ thing, name, block }: { thing: Thing; name: (l: Letter) => string; block?: boolean }) {
  if (thing.unknownFor.length === 0) return null;
  const who = joinNames(thing.unknownFor.map(name));
  const text =
    thing.kind === "major" ? `${who} reported no bachelor's degrees, so its majors are unknown.` : `no data for ${who}`;
  return block ? (
    <p className="mt-2 text-xs text-[var(--text-muted)]">{text}</p>
  ) : (
    <span className="text-xs text-[var(--text-muted)]"> · {text}</span>
  );
}

// ——— The figures behind the bands ———

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v)}%`);
const num = (v: number | null) => (v == null ? "—" : Math.round(v).toLocaleString());
const usd = (v: number | null) => (v == null ? "—" : `$${Math.round(v).toLocaleString()}`);
const HIGHEST_DEGREE: Record<number, string> = { 5: "Bachelor's", 6: "Bachelor's", 7: "Master's", 8: "Master's", 9: "Doctorate" };

const ROWS: { label: string; value: (p: TriangleProfile) => string }[] = [
  { label: "Type", value: (p) => (p.control === 1 ? "Public" : p.control === 2 ? "Private nonprofit" : "—") },
  { label: "Location", value: (p) => [p.city, p.state].filter(Boolean).join(", ") || "—" },
  { label: "Setting", value: (p) => (p.locale ? (LOCALE_LABELS[p.locale] ?? "—") : "—") },
  { label: "Undergraduates", value: (p) => num(p.undergradTotal) },
  { label: "Highest degree", value: (p) => (p.highestOffering ? (HIGHEST_DEGREE[p.highestOffering] ?? "—") : "—") },
  { label: "Admit rate", value: (p) => pct(p.admitRate) },
  { label: "Typical SAT (or ACT equivalent)", value: (p) => num(p.satIndex) },
  { label: "Graduation rate", value: (p) => pct(p.gradRate) },
  { label: "Sticker price per year", value: (p) => usd(p.costOfAttendance) },
  { label: "International students", value: (p) => pct(p.pctNonresident) },
  { label: "Bachelor's majors offered", value: (p) => (p.majors.size > 0 ? String(p.majors.size) : "—") },
];

function SideBySide({ profiles }: { profiles: Record<Letter, TriangleProfile> }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold tracking-tight">Side by side</h2>
      <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--surface)] text-left">
              <th className="px-4 py-2.5 font-medium text-[var(--text-muted)]" />
              {LETTERS.map((l) => (
                <th key={l} className="px-4 py-2.5 font-medium">
                  <span className="flex items-center gap-2">
                    <LetterBadge letter={l} size="sm" />
                    {profiles[l].name}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label} className="border-b border-[var(--border)] last:border-0">
                <th scope="row" className="px-4 py-2 text-left font-normal text-[var(--text-muted)]">
                  {row.label}
                </th>
                {LETTERS.map((l) => (
                  <td key={l} className="px-4 py-2 tabular-nums text-[var(--text-secondary)]">
                    {row.value(profiles[l])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        Sticker price is the published cost of tuition, fees, housing, food, and books before any financial aid;
        for public colleges it is the average of the in-state and out-of-state prices.
      </p>
    </section>
  );
}
