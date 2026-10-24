import Link from "next/link";
import { AXES, describeSize, formatValue, type CollegeNetwork } from "@/lib/college-network";

/** Every school in the network as plain rows — the same facts as the diagram, without it. */
export function NetworkTable({ network, view }: { network: CollegeNetwork; view: string }) {
  const { target, peers } = network;
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--border)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--surface)] text-left text-[var(--text-muted)]">
            <th className="px-3 py-2 font-medium">College</th>
            <th className="px-3 py-2 font-medium">Size</th>
            {AXES.map((a) => (
              <th key={a.key} className="px-3 py-2 font-medium">
                {a.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[target, ...peers].map((s) => {
            const isTarget = s === target;
            return (
              <tr key={s.unitid} className="border-b border-[var(--border)] last:border-0">
                <td className="px-3 py-2">
                  {isTarget ? (
                    <span className="font-semibold">{s.name} (your pick)</span>
                  ) : (
                    <Link href={`/network/${view}?id=${s.unitid}`} className="hover:underline">
                      {s.name}
                    </Link>
                  )}
                </td>
                <td className="px-3 py-2 tabular-nums text-[var(--text-secondary)]">
                  {s.undergrad?.toLocaleString() ?? "—"}
                  {!isTarget && <span className="block text-xs text-[var(--text-muted)]">{describeSize(s.sizeRatio)}</span>}
                </td>
                {AXES.map((a) => (
                  <td key={a.key} className="px-3 py-2 tabular-nums text-[var(--text-secondary)]">
                    {formatValue(a.key, s.values[a.key])}
                    {!isTarget && s.verdicts[a.key] !== "unknown" && (
                      <span
                        className={`block text-xs ${s.verdicts[a.key] === "better" ? "font-medium text-[var(--foreground)]" : "text-[var(--text-muted)]"}`}
                      >
                        {s.verdicts[a.key]}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
