"use client";

import * as React from "react";
import { routes } from "@/lib/routing/routes";
import { ButtonLink } from "@/components/ui/button";
import { useSession } from "@/components/session";

/** "Start your guild" for anyone who streams, or the way back to the studio for whoever already runs one. */
export function StartGuildButton({ className }: { className?: string }) {
  const s = useSession();
  if (!s.ready) return null;
  return (
    <ButtonLink href={routes.studio} variant="secondary" size="sm" className={className}>
      {s.state.realm ? "Creator studio" : "Start your guild"}
    </ButtonLink>
  );
}
