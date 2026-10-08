"use client";

import * as React from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useWeb3 } from "@/components/experience";

/**
 * A link out to the block explorer, opening in a new tab. Web3 only, since a web2 screen shows no
 * receipts, unless `always`: the tip with ETH from another chain is on-chain by nature.
 */
export function ExplorerLink({ href, children, className, always = false }: { href: string; children: React.ReactNode; className?: string; always?: boolean }) {
  const web3 = useWeb3();
  if (!web3 && !always) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-xs underline decoration-line-strong underline-offset-2 transition hover:text-ink",
        className,
      )}
    >
      {children}
      <ArrowUpRight className="size-3" aria-hidden />
    </a>
  );
}
