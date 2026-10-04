"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/skeleton";

/**
 * Shown when a live page cannot load its data (the indexer is down or still starting). It retries
 * on its own every few seconds, so the page comes back by itself when the data does.
 */
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  React.useEffect(() => {
    const timer = window.setTimeout(reset, 6_000);
    return () => window.clearTimeout(timer);
  }, [reset]);

  return (
    <div className="mx-auto max-w-lg py-16">
      <EmptyState
        title="We can’t reach the live data"
        description="It isn’t responding right now. This page keeps trying, and will load as soon as it is back."
        action={<Button onClick={reset}>Try again now</Button>}
      />
    </div>
  );
}
