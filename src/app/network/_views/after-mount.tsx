"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * Renders the diagram in the browser only. The layouts are floating-point
 * heavy (force simulation, MDS, trig), and a last-digit difference between the
 * server's math and the browser's would be a hydration mismatch; the table
 * under the diagram carries the same facts for anything that never runs it.
 */
export function AfterMount({ children, minHeight }: { children: React.ReactNode; minHeight: number }) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return mounted ? <>{children}</> : <div style={{ minHeight }} aria-busy="true" />;
}
