import Link from "next/link";

type PeerNode = {
  unitid: number;
  name: string;
  state: string | null;
  distance: number;
};

export type PeerMode = {
  key: string;
  label: string;
  description: string;
  peers: PeerNode[];
};

export function PeerNetwork({ modes }: { target: { unitid: number; name: string; state: string | null }; modes: PeerMode[] }) {
  const counts = new Map<number, number>();
  for (const mode of modes) {
    for (const p of mode.peers) counts.set(p.unitid, (counts.get(p.unitid) ?? 0) + 1);
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <h3 className="text-sm font-medium">Peer network</h3>
      <div className="mt-3 grid gap-6 sm:grid-cols-2">
        {modes.map((mode) => (
          <div key={mode.key}>
            <h4 className="text-xs font-semibold text-[var(--text-secondary)]">{mode.label}</h4>
            <p className="mt-1 text-xs text-[var(--text-muted)]">{mode.description}</p>
            {mode.peers.length === 0 ? (
              <p className="mt-4 mb-4 text-sm text-[var(--text-muted)]">
                Not enough comparable institutions with complete data to build this list.
              </p>
            ) : (
              <ol className="mt-3 space-y-1 text-xs text-[var(--text-secondary)]">
                {mode.peers.map((p) => {
                  const onBothLists = (counts.get(p.unitid) ?? 0) > 1;
                  return (
                    <li key={p.unitid}>
                      <Link
                        href={`/institutions/${p.unitid}`}
                        className={`hover:text-[var(--series-1)] hover:underline ${onBothLists ? "font-semibold" : ""}`}
                      >
                        {p.name}
                      </Link>
                      {p.state ? `, ${p.state}` : ""}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
