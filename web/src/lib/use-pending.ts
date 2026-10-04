"use client";

import * as React from "react";

/**
 * Runs an async task with a pending flag, and ignores a second tap while one is running (a real
 * transaction takes a moment, and a double tap must not send it twice).
 */
export function usePending() {
  const [pending, setPending] = React.useState(false);
  const busy = React.useRef(false);

  const run = React.useCallback(async <T>(task: () => T | Promise<T>): Promise<T | undefined> => {
    if (busy.current) return undefined;
    busy.current = true;
    setPending(true);
    try {
      return await task();
    } finally {
      busy.current = false;
      setPending(false);
    }
  }, []);

  return { pending, run };
}
