"use client";

import { useRouter } from "next/navigation";
import { InstitutionCombobox, type PickedInstitution } from "@/components/institution-combobox";

/** Picking a school goes straight to its network in `view`. */
export function NetworkPicker({ view, initial }: { view: string; initial: PickedInstitution | null }) {
  const router = useRouter();
  return (
    <div className="max-w-md">
      <InstitutionCombobox
        label="Start from a college"
        value={initial}
        onChange={(v) => {
          if (v) router.push(`/network/${view}?id=${v.unitid}`);
        }}
      />
    </div>
  );
}
