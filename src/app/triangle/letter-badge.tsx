import { LETTER_COLORS, type Letter } from "@/lib/triangle-letters";

/** A pick's letter on its identity color — the color never appears without the letter. */
export function LetterBadge({ letter, size = "md" }: { letter: Letter; size?: "xs" | "sm" | "md" }) {
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${
        size === "xs" ? "h-4 w-4 text-[9px]" : size === "sm" ? "h-5 w-5 text-[11px]" : "h-7 w-7 text-sm"
      }`}
      style={{ background: LETTER_COLORS[letter] }}
    >
      {letter}
    </span>
  );
}
