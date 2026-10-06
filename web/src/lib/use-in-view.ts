"use client";

import * as React from "react";

/**
 * True while the element is on screen. Idle animations use it to stop when nobody can see them,
 * so a long-open page does not keep the GPU busy.
 */
export function useInView<T extends Element>(rootMargin = "0px"): [React.RefObject<T | null>, boolean] {
  const ref = React.useRef<T>(null);
  const [inView, setInView] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setInView(entry?.isIntersecting ?? false), { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);
  return [ref, inView];
}
