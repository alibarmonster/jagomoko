"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { routes } from "@/lib/routes";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useSession } from "@/components/session";
import { AuthFlow } from "./auth-flow";

/**
 * Wraps any trigger (a button) in the sign-in / create-character flow. Opens a
 * sheet on mobile and a dialog on desktop; closes itself when the viewer is in.
 */
export function AuthDialog({ trigger }: { trigger: React.ReactElement }) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { signedIn, hasCharacter, state, ready } = useSession();
  const complete = signedIn && hasCharacter && state.balance > 0n;

  // Privy's sign-in modal cannot open over this dialog, so the dialog steps aside and comes back
  // for the next step (role and name) once the viewer is signed in.
  const [resume, setResume] = React.useState(false);
  React.useEffect(() => {
    if (!resume || !ready || !signedIn) return;
    if (!hasCharacter) setOpen(true);
    setResume(false);
  }, [resume, ready, signedIn, hasCharacter]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle className="sr-only">Create your character</DialogTitle>
        <DialogDescription className="sr-only">Sign in with your email, choose a role and add practice gold.</DialogDescription>
        <AuthFlow
          onDone={() => {
            setOpen(false);
            // finishing on the front page means: now go and play
            if (pathname === routes.home) router.push(routes.realms);
          }}
          onSignIn={() => {
            setResume(true);
            setOpen(false);
          }}
          doneLabel={complete ? "Start playing" : "Continue"} />
      </DialogContent>
    </Dialog>
  );
}
