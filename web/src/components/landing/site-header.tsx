"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Menu } from "lucide-react";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";
import { Wordmark } from "@/components/ui/sigil";
import { Button, ButtonLink } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AccountChip } from "@/components/app/account-chip";
import { AuthDialog } from "@/components/app/auth-dialog";
import { useSession } from "@/components/session";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#quests", label: "Quests" },
  { href: "#battles", label: "Battles" },
  { href: routes.studio, label: "For streamers" },
  { href: "#faq", label: "FAQ" },
] as const;

/** Sticky, 56px. The hairline appears after 8px of scroll. */
export function SiteHeader() {
  const session = useSession();
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b bg-canvas/90 backdrop-blur-md transition-colors duration-(--dur-ui)",
        scrolled ? "border-line" : "border-transparent",
      )}
      style={{ height: "var(--header-h)" }}
    >
      <div className="container-page grid h-full grid-cols-[1fr_auto] items-center gap-4 lg:grid-cols-[1fr_auto_1fr]">
        <Link href={routes.home} className="justify-self-start rounded-sm" aria-label="jagomoko home">
          <Wordmark />
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-8 lg:flex">
          {LINKS.map((l) => (
            <Link key={l.label} href={l.href} className="rounded-sm text-sm font-medium text-ink transition-colors hover:text-subtle">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center justify-self-end gap-2">
          {!session.ready ? (
            <div className="h-9 w-44" aria-hidden />
          ) : session.signedIn ? (
            <>
              <ButtonLink href={session.state.realm ? routes.studio : routes.realms} size="sm" className="hidden sm:inline-flex">
                {session.state.realm ? "Open studio" : "Open app"}
                <ArrowRight aria-hidden />
              </ButtonLink>
              <AccountChip />
            </>
          ) : (
            <>
              <AuthDialog
                trigger={
                  <Button variant="ghost" size="sm" className="hidden sm:inline-flex">
                    Sign in
                  </Button>
                }
              />
              <AuthDialog trigger={<Button size="sm">Create your character</Button>} />
            </>
          )}

          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Open menu">
                <Menu aria-hidden />
              </Button>
            </DialogTrigger>
            <DialogContent width="sm">
              <DialogTitle className="sr-only">Menu</DialogTitle>
              <DialogDescription className="sr-only">Site navigation</DialogDescription>
              <nav aria-label="Mobile" className="-mx-2 flex flex-col">
                {LINKS.map((l) => (
                  <DialogClose key={l.label} asChild>
                    <Link href={l.href} className="rounded-sm px-2 py-3 text-lg text-ink transition-colors hover:bg-sunken">
                      {l.label}
                    </Link>
                  </DialogClose>
                ))}
              </nav>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </header>
  );
}
