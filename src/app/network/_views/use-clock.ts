import { useEffect, useState } from "react";
import { prefersReducedMotion } from "./geometry";

/**
 * Seconds since mount, ticking at about `fps`, for decorative motion only —
 * layouts never depend on it. Stays at 0 for readers who prefer less motion,
 * and on the server, so the first render is the still picture.
 */
export function useClock(fps = 30) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let frame = 0;
    let last = 0;
    const start = performance.now();
    const loop = (now: number) => {
      if (now - last >= 1000 / fps) {
        last = now;
        setT((now - start) / 1000);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [fps]);
  return t;
}
