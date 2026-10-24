"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LETTERS, LETTER_COLORS } from "@/lib/triangle-letters";
import { InstitutionCombobox, type PickedInstitution } from "@/components/institution-combobox";
import { LetterBadge } from "./letter-badge";

export type { PickedInstitution };

export function TrianglePicker({ initial }: { initial: (PickedInstitution | null)[] }) {
  const router = useRouter();
  const [picks, setPicks] = useState<(PickedInstitution | null)[]>(initial);

  const ids = picks.map((p) => p?.unitid);
  const complete = ids.every((id) => id != null);
  const distinct = new Set(ids).size === 3;

  return (
    <form
      className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!complete || !distinct) return;
        const [a, b, c] = ids;
        router.push(`/triangle?a=${a}&b=${b}&c=${c}`);
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {LETTERS.map((letter, i) => (
          <InstitutionCombobox
            key={letter}
            label={
              <>
                <LetterBadge letter={letter} size="sm" />
                College {letter}
              </>
            }
            accent={LETTER_COLORS[letter]}
            value={picks[i]}
            onChange={(v) => setPicks((p) => p.map((old, j) => (j === i ? v : old)))}
          />
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={!complete || !distinct}
          className="rounded-md bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--background)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Compare
        </button>
        <span className="text-sm text-[var(--text-muted)]">
          {complete && !distinct ? "Pick three different colleges." : !complete ? "Pick one college in each box." : ""}
        </span>
      </div>
    </form>
  );
}
