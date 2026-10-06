import * as React from "react";
import { Button } from "@/components/ui/button";
import { AuthDialog } from "@/components/app/auth-dialog";
import { Mascot } from "@/components/ui/mascot";

/** The one dark moment: a full-bleed inverse band with a single light button. */
export function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="relative overflow-hidden bg-inverse text-on-inverse">
      <Mascot name="moko-bust-love" height={260} className="absolute bottom-0 right-0 hidden md:block" />
      <div className="container-page relative flex flex-col items-start gap-8 py-20 md:py-28">
        <div className="max-w-[28rem]" data-rise>
          <h2 id="cta-title" className="text-3xl">
            Start your character in under a minute
          </h2>
          <p className="mt-3 text-base text-on-inverse-muted">Sign in with your email. No app, no wallet, no real money while we&rsquo;re on testnet.</p>
        </div>
        <div data-rise className="relative">
          <AuthDialog
            trigger={
              <Button variant="inverse" size="lg">
                Create your character
              </Button>
            }
          />
        </div>
      </div>
    </section>
  );
}
