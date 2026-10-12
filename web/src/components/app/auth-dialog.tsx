"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { routes } from "@/lib/routing/routes";
import type { Role } from "@/lib/domain/roles";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Wordmark } from "@/components/ui/sigil";
import { useSession } from "@/components/session";
import { AuthFlow } from "./auth-flow";
import { AuthShowcase, type ShowcaseStage } from "./auth-showcase";
import { SignInForm } from "./sign-in-form";

type View = "create" | "signin";

const AuthDialogContext = React.createContext<((view: View) => void) | null>(null);

const switchLink = "rounded-xs font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink";

/**
 * The one sign-in popup of the app, mounted once (components/providers.tsx). Buttons only open it
 * (AuthDialog, SignInDialog), so it stays open when the button that opened it goes away: the header
 * swaps its buttons the moment you are signed in, and the tip panel the moment your character exists.
 * Two front doors that can switch between each other:
 *  - "create": Create your character, a wide split popup with the steps on the left and art on the right;
 *  - "signin": Sign in, a small card (email and code, no steps) that takes you to the creator studio.
 * A sheet on phones, a dialog from md up. No Privy screen: the forms use its headless email login.
 */
export function AuthDialogHost({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState<View>("create");
  const [role, setRole] = React.useState<Role>("Knight");
  const router = useRouter();
  const pathname = usePathname();
  const { signedIn, hasCharacter, state, ready } = useSession();
  const complete = signedIn && hasCharacter && state.balance > 0n;
  const stage: ShowcaseStage = signedIn && ready && hasCharacter ? "reward" : signedIn && ready ? "role" : "intro";

  const show = React.useCallback((next: View) => {
    setView(next);
    setOpen(true);
  }, []);

  return (
    <AuthDialogContext.Provider value={show}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        {view === "signin" ? (
          <DialogContent width="sm">
            <DialogTitle className="sr-only">Sign in</DialogTitle>
            <DialogDescription className="sr-only">Sign in with your email and a 6-digit code.</DialogDescription>
            <SignInForm
              onSignedIn={() => {
                setOpen(false);
                router.push(routes.studio);
              }}
            />
            <p className="mt-5 border-t border-line pt-4 text-center text-sm text-muted">
              New here?{" "}
              <button type="button" className={switchLink} onClick={() => setView("create")}>
                Create your character
              </button>
            </p>
          </DialogContent>
        ) : (
          <DialogContent
            width="xl"
            flush
            closeClassName="md:right-5 md:top-5 md:bg-ink/55 md:text-on-inverse md:backdrop-blur-sm md:hover:bg-ink/75 md:hover:text-on-inverse"
          >
            <DialogTitle className="sr-only">Create your character</DialogTitle>
            <DialogDescription className="sr-only">Sign in with your email, choose a role and add practice gold.</DialogDescription>
            <div className="grid md:min-h-[600px] md:grid-cols-2">
              <div className="flex flex-col p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:px-8 md:py-6">
                <Wordmark className="hidden md:inline-flex" />
                <div className="flex flex-1 flex-col justify-center md:py-5">
                  <AuthFlow
                    role={role}
                    onRoleChange={setRole}
                    onDone={() => {
                      setOpen(false);
                      // finishing on the front page means: now go and play
                      if (pathname === routes.home) router.push(routes.realms);
                    }}
                    doneLabel={complete ? "Start playing" : "Continue"}
                  />
                </div>
                {signedIn ? null : (
                  <p className="mt-6 text-sm text-muted">
                    Been here before?{" "}
                    <button type="button" className={switchLink} onClick={() => setView("signin")}>
                      Sign in
                    </button>
                  </p>
                )}
              </div>
              <AuthShowcase stage={stage} role={role} className="m-2 hidden md:flex" />
            </div>
          </DialogContent>
        )}
      </Dialog>
    </AuthDialogContext.Provider>
  );
}

type Trigger = React.ReactElement<{ onClick?: React.MouseEventHandler; "aria-haspopup"?: "dialog" }>;

function useOpener(trigger: Trigger, view: View) {
  const show = React.useContext(AuthDialogContext);
  if (!show) return trigger;
  return React.cloneElement(trigger, {
    "aria-haspopup": "dialog",
    onClick: (e: React.MouseEvent) => {
      trigger.props.onClick?.(e);
      if (!e.defaultPrevented) show(view);
    },
  });
}

/** Wraps a button so it opens Create your character (it resumes where the viewer left off). */
export function AuthDialog({ trigger }: { trigger: Trigger }) {
  return useOpener(trigger, "create");
}

/** Wraps a button so it opens the Sign in card. */
export function SignInDialog({ trigger }: { trigger: Trigger }) {
  return useOpener(trigger, "signin");
}
