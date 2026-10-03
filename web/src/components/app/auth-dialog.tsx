"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useSession } from "@/components/session";
import { AuthFlow } from "./auth-flow";

/**
 * Wraps any trigger (a button) in the sign-in / create-character flow. Opens a
 * sheet on mobile and a dialog on desktop; closes itself when the viewer is in.
 */
export function AuthDialog({ trigger }: { trigger: React.ReactElement }) {
  const [open, setOpen] = React.useState(false);
  const { signedIn, hasCharacter, state } = useSession();
  const complete = signedIn && hasCharacter && state.balance > 0n;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle className="sr-only">Create your character</DialogTitle>
        <DialogDescription className="sr-only">Sign in with your email, choose a role and add practice gold.</DialogDescription>
        <AuthFlow onDone={() => setOpen(false)} doneLabel={complete ? "Start playing" : "Continue"} />
      </DialogContent>
    </Dialog>
  );
}
