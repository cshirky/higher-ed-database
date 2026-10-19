"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LETTERS, LETTER_COLORS, type Letter } from "@/lib/triangle-letters";
import { LetterBadge } from "./letter-badge";

export type PickedInstitution = { unitid: number; name: string; city: string | null; state: string | null };

const place = (i: PickedInstitution) => [i.city, i.state].filter(Boolean).join(", ");

/** One autocomplete box. Picking a suggestion hands it up; editing the text clears the pick. */
function InstitutionCombobox({
  letter,
  value,
  onChange,
}: {
  letter: Letter;
  value: PickedInstitution | null;
  onChange: (v: PickedInstitution | null) => void;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [text, setText] = useState(value?.name ?? "");
  const [fetched, setFetched] = useState<PickedInstitution[]>([]);
  // Too short to search, or already picked: nothing to suggest, whatever the last fetch returned.
  const results = text.trim().length >= 2 && !value ? fetched : [];
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Debounced lookup; a newer keystroke aborts the older request.
  useEffect(() => {
    if (value && text === value.name) return;
    const q = text.trim();
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/institutions/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const { results } = (await res.json()) as { results: PickedInstitution[] };
        setFetched(results);
        setActive(0);
        setOpen(true);
      } catch {
        // Aborted by the next keystroke, or offline: leave the list as it was.
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, value]);

  function choose(i: PickedInstitution) {
    onChange(i);
    setText(i.name);
    setOpen(false);
  }

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1.5 flex items-center gap-2 text-sm font-medium">
        <LetterBadge letter={letter} size="sm" />
        College {letter}
      </label>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        placeholder="Start typing a name…"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (value) onChange(null);
        }}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={(e) => {
          if (!open || results.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % results.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a - 1 + results.length) % results.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            choose(results[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:ring-2"
        style={{ ["--tw-ring-color" as string]: LETTER_COLORS[letter], borderColor: value ? LETTER_COLORS[letter] : undefined }}
      />
      {value && <p className="mt-1 truncate text-xs text-[var(--text-muted)]">{place(value)}</p>}
      {open && results.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-md border border-[var(--border)] bg-[var(--surface)] py-1 text-sm shadow-lg"
        >
          {results.map((r, i) => (
            <li
              key={r.unitid}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault(); // keep focus, so blur does not close the list first
                clearTimeout(blurTimer.current);
                choose(r);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-1.5 ${i === active ? "bg-[var(--gridline)]" : ""}`}
            >
              <span className="block">{r.name}</span>
              <span className="block text-xs text-[var(--text-muted)]">{place(r)}</span>
            </li>
          ))}
        </ul>
      )}
      {open && results.length === 0 && text.trim().length >= 2 && !value && fetched.length === 0 && (
        <p className="absolute z-10 mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-muted)] shadow-lg">
          No four-year college matches.
        </p>
      )}
    </div>
  );
}

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
            letter={letter}
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
