"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { routes } from "@/lib/routing/routes";
import { useSession } from "@/components/session";

/** Signs out and goes back to the front page. */
export function useSignOut() {
  const { actions } = useSession();
  const router = useRouter();
  return React.useCallback(async () => {
    await actions.signOut();
    router.push(routes.home);
  }, [actions, router]);
}
