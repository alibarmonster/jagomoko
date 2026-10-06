"use client";

import * as React from "react";
import { ArrowLeftRight, RefreshCw } from "lucide-react";
import { CONTRACTS, POOL_LIVE } from "@/lib/chain/config";
import { createCalls } from "@/lib/chain/calls";
import { poolAbi } from "@/lib/chain/abis";
import { browserPublicClient } from "@/lib/chain/browser";
import { SAMPLE_DATA } from "@/lib/config";
import { formatUsd, type Usd } from "@/lib/utils/money";
import { viewTx } from "@/lib/chain/explorer";
import { usePending } from "@/hooks/use-pending";
import { blendedAprBps, formatApr, formatPrice8, mixMove, poolTotal, type PoolSnapshot } from "@/lib/domain/pool";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { MonoLabel } from "@/components/ui/status-pill";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/components/session";
import { PoolMixBar, useChainRun, usePool } from "@/components/app/pool-card";

const calls = createCalls(CONTRACTS);

/** What pressing Apply would do, in words, next to the slider. */
function mixPreview(pool: PoolSnapshot, target: number): string {
  const now = `Now ${pool.lstBps / 100}% (the violet mark).`;
  if (target === pool.lstBps) return now;
  if (poolTotal(pool) === 0n) return `${now} The pool is empty, so this only sets how new money is split.`;
  const move = mixMove(pool, target);
  const about = formatUsd((move < 0n ? -move : move) as Usd);
  return move >= 0n
    ? `${now} Applying ${target / 100}% swaps about ${about} of mUSD to mMON and stakes it, in one transaction.`
    : `${now} Applying ${target / 100}% unstakes about ${about} and swaps it back to mUSD, in one transaction.`;
}

/** Whether this account may set the pool's mix (the CURATOR role). */
function useIsCurator(address: string | null) {
  const [curator, setCurator] = React.useState(false);
  React.useEffect(() => {
    if (!POOL_LIVE || !address) return setCurator(false);
    let live = true;
    const client = browserPublicClient();
    void (async () => {
      try {
        const role = await client.readContract({ address: CONTRACTS.pool, abi: poolAbi, functionName: "CURATOR" });
        const has = await client.readContract({ address: CONTRACTS.pool, abi: poolAbi, functionName: "hasRole", args: [role, address as `0x${string}`] });
        if (live) setCurator(has);
      } catch {
        if (live) setCurator(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [address]);
  return curator;
}

/**
 * The Community Pool from the studio: what it holds and earns, and, for jagomoko's curator, the
 * switch that moves it between token staking and liquid staking (the mUSD -> mMON swap and stake).
 */
export function StudioPool() {
  const s = useSession();
  const { push } = useToast();
  const { data, failed } = usePool();
  const curator = useIsCurator(s.address);
  const runChain = useChainRun();
  const [lstBps, setLstBps] = React.useState<number | null>(null);
  const applying = usePending();
  const rebalancing = usePending();

  if (!POOL_LIVE && !SAMPLE_DATA) {
    return (
      <Card className="p-5">
        <h1 className="text-lg text-ink">Community Pool</h1>
        <p className="mt-1 text-sm text-muted">The pool is not deployed yet. Once it is, treasuries can vote to earn yield here.</p>
      </Card>
    );
  }
  if (!data) return <p className="text-sm text-muted">{failed ? "The pool can't be read right now." : "Reading the pool…"}</p>;

  const { pool } = data;
  const target = lstBps ?? pool.lstBps;
  const total = poolTotal(pool);

  function apply() {
    return applying.run(async () => {
      const r = await runChain(calls.setPoolMix(target));
      if (!r.ok) return push({ tone: "danger", title: "Couldn't change the mix", description: r.error });
      setLstBps(null);
      push({ tone: "success", title: `Liquid staking set to ${target / 100}%`, description: "The pool swapped and staked to match.", action: viewTx(r.tx) });
    });
  }

  function rebalance() {
    return rebalancing.run(async () => {
      const r = await runChain(calls.rebalancePool());
      if (!r.ok) return push({ tone: "danger", title: "Couldn't rebalance", description: r.error });
      push({ tone: "success", title: "Pool rebalanced", action: viewTx(r.tx) });
    });
  }

  return (
    <div className="space-y-6">
      <header className="max-w-2xl">
        <h1 className="text-2xl text-ink">Community Pool</h1>
        <p className="mt-2 text-base text-muted">
          Where guild treasuries earn yield. Each guild votes how much goes in; the pool splits it between token staking and liquid staking.
        </p>
      </header>

      <Card className="p-5">
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <p className="text-sm text-subtle">In the pool</p>
            <p className="mt-1 font-mono text-2xl text-ink tnum">{formatUsd(total, { cents: "always" })}</p>
          </div>
          <div>
            <p className="text-sm text-subtle">Token staking</p>
            <p className="mt-1 font-mono text-2xl text-ink tnum">{formatUsd(pool.stable, { cents: "always" })}</p>
          </div>
          <div>
            <p className="text-sm text-subtle">Liquid staking</p>
            <p className="mt-1 font-mono text-2xl text-ink tnum">{formatUsd(pool.lst, { cents: "always" })}</p>
          </div>
          <div>
            <p className="text-sm text-subtle">Yield</p>
            <p className="mt-1 font-mono text-2xl text-ink tnum">{formatApr(blendedAprBps(pool))}</p>
            <p className="mt-0.5 text-xs text-muted">1 MON = {formatPrice8(pool.monPrice)}</p>
          </div>
        </div>
        <PoolMixBar pool={pool} className="mt-5" />
        {s.signedIn && !SAMPLE_DATA ? (
          <Button variant="ghost" size="sm" className="mt-4" loading={rebalancing.pending} onClick={() => void rebalance()}>
            <RefreshCw aria-hidden /> Rebalance the pool
          </Button>
        ) : null}
      </Card>

      <Card className="p-5">
        <MonoLabel>Curator</MonoLabel>
        <h2 className="mt-1 text-lg text-ink">Liquid staking share</h2>
        {curator ? (
          <>
            <p className="mt-0.5 text-sm text-muted">
              Raising it swaps mUSD to mMON and stakes it as stMON; lowering it unstakes instantly and swaps back. At most half the pool.
            </p>
            <div className="mt-5 flex items-baseline justify-between">
              <span className="text-sm text-ink">Liquid staking</span>
              <span className="font-mono text-lg text-ink tnum">{target / 100}%</span>
            </div>
            <Slider className="mt-3" label="Liquid staking share" min={0} max={5_000} step={500} mark={pool.lstBps} value={[target]} onValueChange={([v]) => setLstBps(v ?? 0)} />
            <p className="mt-3 text-xs text-muted">{mixPreview(pool, target)}</p>
            <Button className="mt-4" loading={applying.pending} disabled={target === pool.lstBps} onClick={() => void apply()}>
              <ArrowLeftRight aria-hidden /> Apply: swap and stake
            </Button>
          </>
        ) : (
          <p className="mt-0.5 text-sm text-muted">
            Set to {pool.lstBps / 100}% by jagomoko&rsquo;s curator. Only the curator changes it; anyone can rebalance the pool toward it.
          </p>
        )}
      </Card>
    </div>
  );
}
