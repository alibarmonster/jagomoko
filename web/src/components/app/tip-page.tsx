"use client";

import * as React from "react";
import { CROSSCHAIN_LIVE, TIP_SOURCES } from "@/lib/chain/config";
import type { Split } from "@/lib/domain/outcomes";
import { Mascot } from "@/components/ui/mascot";
import { useChooseExperience, useWeb3 } from "@/components/experience";
import { TipPageCard } from "./crosschain-tip";
import { TipPanel } from "./tip-panel";

const switchLink = "rounded-xs text-ink underline underline-offset-2 hover:decoration-ink";

/**
 * Where the QR on stream leads. In web2 it is the everyday tip: sign in with an email and tip
 * with practice gold, sponsored, on Monad. In web3 it is the tip with ETH from another chain, paid
 * from the viewer's own wallet. Each offers the other. A web3 QR (?pay=eth) opens on the ETH form.
 */
export function TipPage({
  creatorId,
  creatorName,
  split,
  withEth = false,
}: {
  creatorId: string;
  creatorName: string;
  split: Split;
  /** opened from a web3 QR (?pay=eth): start on the ETH form, whatever this browser's mode */
  withEth?: boolean;
}) {
  const web3 = useWeb3();
  const choose = useChooseExperience();
  const [ethFirst, setEthFirst] = React.useState(withEth);

  if ((web3 || ethFirst) && CROSSCHAIN_LIVE) {
    return (
      <TipPageCard
        creatorId={creatorId}
        creatorName={creatorName}
        formFooter={
          <p className="mt-4 text-center text-sm text-muted">
            No crypto wallet?{" "}
            <button
              type="button"
              className={switchLink}
              onClick={() => {
                setEthFirst(false);
                choose("web2");
              }}
            >
              Tip with your email
            </button>
          </p>
        }
      />
    );
  }

  return (
    <>
      {/* Moko stands on the card's top edge */}
      <div className="relative pt-12">
        <Mascot name="moko-hello" height={72} eager className="absolute right-6 top-0 z-10" />
        <TipPanel creatorId={creatorId} creatorName={creatorName} split={split} />
      </div>
      {CROSSCHAIN_LIVE ? (
        <p className="mt-4 text-center text-sm text-muted">
          Have a crypto wallet?{" "}
          <button type="button" className={switchLink} onClick={() => choose("web3")}>
            Pay with ETH from {TIP_SOURCES[0]?.short ?? "another chain"}
          </button>
        </p>
      ) : null}
    </>
  );
}
