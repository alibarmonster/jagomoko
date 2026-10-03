import * as React from "react";
import { cn } from "@/lib/cn";
import { formatUsd, type Usd } from "@/lib/money";
import { questOutcomes, type Split } from "@/lib/outcomes";

/**
 * "What happens to your $X" for every way a quest can end. Rendered before any
 * confirm button, with exact amounts (same rounding as the contracts).
 */
export function OutcomeTable({
  amount,
  split,
  creatorName = "the creator",
  className,
}: {
  amount: Usd;
  split: Split;
  creatorName?: string;
  className?: string;
}) {
  const o = questOutcomes(amount, split);
  const m = (v: Usd) => formatUsd(v, { cents: "always" });
  const rows: { when: string; what: React.ReactNode }[] = [
    {
      when: "They make it",
      what: (
        <>
          <span className="font-mono tnum">{m(o.complete.creator)}</span> to {creatorName},{" "}
          <span className="font-mono tnum">{m(o.complete.treasury)}</span> to the treasury,{" "}
          <span className="font-mono tnum">{m(o.complete.community)}</span> to the community
        </>
      ),
    },
    {
      when: "They miss",
      what: (
        <>
          <span className="font-mono tnum">{m(o.failed.refund)}</span> back to you,{" "}
          <span className="font-mono tnum">{m(o.failed.toTreasury)}</span> to the community treasury
        </>
      ),
    },
    {
      when: "It can’t be called",
      what: (
        <>
          <span className="font-mono tnum">{m(o.void.refund)}</span> back to you
        </>
      ),
    },
  ];
  return (
    <table className={cn("w-full border-collapse text-left text-sm", className)}>
      <caption className="sr-only">What happens to your {m(amount)} in each outcome</caption>
      <tbody className="divide-y divide-line border-y border-line">
        {rows.map((r) => (
          <tr key={r.when} className="align-top">
            <th scope="row" className="w-[34%] py-2.5 pr-3 text-left font-medium text-ink">
              {r.when}
            </th>
            <td className="py-2.5 text-muted">{r.what}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
