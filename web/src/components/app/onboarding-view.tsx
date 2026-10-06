"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { routes } from "@/lib/routes";
import { Card } from "@/components/ui/card";
import { AuthFlow } from "./auth-flow";

/** The same first-five-minutes flow as the sheets, on its own page (for deep links and the landing CTA fallback). */
export function OnboardingView() {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-md py-6 md:py-14">
      <h1 className="sr-only">Create your character</h1>
      <Card className="p-5 md:p-7">
        <AuthFlow onDone={() => router.push(routes.realms)} doneLabel="Find your guild" />
      </Card>
    </div>
  );
}
