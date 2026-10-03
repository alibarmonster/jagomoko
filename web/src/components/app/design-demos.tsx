"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { AmountPicker } from "@/components/ui/amount-picker";
import { useToast } from "@/components/ui/toast";
import { LevelUpBurst, XPGainChip } from "@/components/app/reward";
import { usd, type Usd } from "@/lib/money";

export function ToastDemo() {
  const { push } = useToast();
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" size="sm" onClick={() => push({ title: "Sent $5 to NeonBlade", description: "Your tip was split between the creator and the community." })}>
        Default toast
      </Button>
      <Button variant="secondary" size="sm" onClick={() => push({ tone: "success", title: "+75 XP" })}>
        Success toast
      </Button>
      <Button variant="secondary" size="sm" onClick={() => push({ tone: "danger", title: "Couldn’t record your vote", description: "Only Judges at level 5 or higher can serve on a jury." })}>
        Error toast
      </Button>
      <Button variant="secondary" size="sm" onClick={() => push({ tone: "levelup", title: "Level 5", description: "You can now serve on the jury. +150 XP", duration: 6500 })}>
        Level-up toast
      </Button>
    </div>
  );
}

export function PickerDemo() {
  const [v, setV] = React.useState<Usd | null>(usd(5));
  return <AmountPicker value={v} onChange={setV} id="demo-amount" />;
}

export function LevelUpDemo() {
  const [n, setN] = React.useState(0);
  return (
    <div className="flex items-center gap-6">
      <div key={n} className="flex h-24 w-24 items-center justify-center">
        <LevelUpBurst level={5} />
      </div>
      <div key={`x${n}`} className="h-8 w-24">
        <XPGainChip xp={150n} />
      </div>
      <Button variant="secondary" size="sm" onClick={() => setN((x) => x + 1)}>
        Replay
      </Button>
    </div>
  );
}
