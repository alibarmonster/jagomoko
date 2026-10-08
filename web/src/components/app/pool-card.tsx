"use client";

import * as React from "react";
import { RefreshCw, Sprout } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { CONTRACTS, POOL_LIVE } from "@/lib/chain/config";
import { createCalls } from "@/lib/chain/calls";
import { browserPublicClient } from "@/lib/chain/browser";
import { SAMPLE_DATA } from "@/lib/config";
import { waitForIndexer } from "@/lib/data/client";
import { formatUsd, type Usd } from "@/lib/utils/money";
import { cleanText, LIMITS } from "@/lib/utils/sanitize";
import { viewTx } from "@/lib/chain/explorer";
import { usePending } from "@/hooks/use-pending";
import {
  blendedAprBps,
  formatApr,
  formatPrice8,
  investedBps,
  mixOf,
  needsRebalance,
  readPool,
  SAMPLE_POOL,
  type PoolSnapshot,
  type TreasuryPool,
} from "@/lib/domain/pool";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, Textarea } from "@/components/ui/field";
import { Slider, SliderScale } from "@/components/ui/slider";
import { MonoLabel } from "@/components/ui/status-pill";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/components/session";
import { useWeb3 } from "@/components/experience";
import { DATA_CHANGED_EVENT } from "./auto-refresh";
import { AuthDialog } from "./auth-dialog";
import { useCelebrate } from "./reward";

const calls = createCalls(CONTRACTS);
const pct = (bps: number) => `${Math.round(bps / 100)}%`;
/** the sample world shows sample numbers, never the live pool's */
const READ_POOL = POOL_LIVE && !SAMPLE_DATA;

/** The pool and one guild's treasury in it, read live from the chain every 15 seconds. */
export function usePool(creatorId?: string) {
  const [data, setData] = React.useState<{ pool: PoolSnapshot; treasury: TreasuryPool | null } | null>(SAMPLE_DATA ? SAMPLE_POOL : null);
  const [failed, setFailed] = React.useState(false);
  const load = React.useCallback(async () => {
    if (!READ_POOL) return;
    try {
      setData(await readPool(browserPublicClient(), CONTRACTS, creatorId === undefined ? undefined : BigInt(creatorId)));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [creatorId]);
  React.useEffect(() => {
    if (!READ_POOL) return;
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 15_000);
    const onChange = () => void load();
    window.addEventListener(DATA_CHANGED_EVENT, onChange);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(DATA_CHANGED_EVENT, onChange);
    };
  }, [load]);
  return { data, failed, reload: load };
}

/** Sends one sponsored batch, waits for the index to reach it, and tells every live screen. */
export function useChainRun() {
  const s = useSession();
  return React.useCallback(
    async (list: ReturnType<typeof calls.rebalancePool>) => {
      const sent = await s.send(list);
      if (!sent.ok) return sent;
      await waitForIndexer(sent.value.blockNumber);
      await s.refresh();
      window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
      return { ok: true as const, value: undefined, tx: sent.value.hash };
    },
    [s],
  );
}

/** The pool's two legs by name: plain words in web2, what they are in web3 (see lib/experience.ts). */
export function legNames(web3: boolean): { stable: string; lst: string } {
  return web3 ? { stable: "Token staking", lst: "Liquid staking" } : { stable: "Steady", lst: "Growth" };
}

/** Token staking vs liquid staking, as the pool holds it right now. */
export function PoolMixBar({ pool, className }: { pool: PoolSnapshot; className?: string }) {
  const web3 = useWeb3();
  const legs = legNames(web3);
  const mix = mixOf(pool);
  const lstPct = Math.round(mix.lst * 100);
  const exitFee = `${((pool.instantFeeBps + 2 * pool.swapFeeBps) / 100).toFixed(1)}%`;
  return (
    <div className={className}>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-line" role="img" aria-label={`${100 - lstPct}% ${legs.stable}, ${lstPct}% ${legs.lst}`}>
        <div className="h-full bg-ink" style={{ width: `${100 - lstPct}%` }} />
        <div className="h-full bg-signal" style={{ width: `${lstPct}%` }} />
      </div>
      <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <li className="flex gap-2">
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-ink" aria-hidden />
          <span>
            <span className="text-ink">{legs.stable}</span> <span className="font-mono text-xs text-subtle tnum">{100 - lstPct}% · {formatApr(pool.stableAprBps)}</span>
            <span className="block text-xs text-muted">{web3 ? "mUSD in a staking vault (ERC-4626)." : "Earns a steady rate."}</span>
          </span>
        </li>
        <li className="flex gap-2">
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-signal" aria-hidden />
          <span>
            <span className="text-ink">{legs.lst}</span> <span className="font-mono text-xs text-subtle tnum">{lstPct}% · {formatApr(pool.lstAprBps)}</span>
            <span className="block text-xs text-muted">
              {web3
                ? `mUSD swapped to mMON at ${formatPrice8(pool.monPrice)} and staked as stMON. It leaves instantly (about ${exitFee} in fees) instead of waiting ${Math.round(pool.unbondingSeconds / 60)} minutes to unbond.`
                : `Earns more, and its value moves with the market. It comes back out instantly for about ${exitFee} in fees.`}
            </span>
          </span>
        </li>
      </ul>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-sm text-subtle">{label}</p>
      <p className="mt-1 font-mono text-2xl text-ink tnum">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-muted">{sub}</p> : null}
    </div>
  );
}

function AllocateDialog({
  creatorId,
  handle,
  treasury,
  open,
  onOpenChange,
}: {
  creatorId: string;
  handle: string;
  treasury: TreasuryPool;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const s = useSession();
  const { push } = useToast();
  const celebrate = useCelebrate();
  const [bps, setBps] = React.useState(Math.max(treasury.targetBps, 2_500));
  const [description, setDescription] = React.useState("Let our treasury earn while it waits for the next bounty.");
  const [error, setError] = React.useState<string | null>(null);
  const { pending, run } = usePending();
  const cleaned = cleanText(description, LIMITS.description, { multiline: true });
  const total = treasury.liquid + treasury.invested;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    return run(async () => {
      const r = await s.actions.proposeAllocation(creatorId, bps, description);
      if (!r.ok) return setError(r.error);
      setError(null);
      onOpenChange(false);
      push({ tone: "success", title: "Proposal submitted", description: "The guild has 24 hours to vote.", action: viewTx(r.tx) });
      if (s.state.character) celebrate(r.value, s.state.character.role);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Put the treasury to work</DialogTitle>
          <DialogDescription>
            Propose how much of {handle}&rsquo;s treasury goes into the Community Pool. Everyone with XP votes for 24 hours; 0% takes it all back out.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-5">
          <div>
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-sm font-medium text-ink">Share of the treasury</span>
              <span className="font-mono text-lg text-ink tnum">{pct(bps)}</span>
            </div>
            <Slider label="Share of the treasury" min={0} max={5_000} step={500} value={[bps]} onValueChange={([v]) => setBps(v ?? 0)} />
            <SliderScale className="mt-1.5" min={0} max={5_000} values={[0, 1_000, 2_000, 3_000, 4_000, 5_000]} format={pct} />
            <p className="mt-2 text-xs text-muted">About {formatUsd(((total * BigInt(bps)) / 10_000n) as Usd, { cents: "always" })} at today&rsquo;s treasury. At most half, so payouts always have money ready.</p>
          </div>
          <Field label="Why?" htmlFor="alloc-desc" counter={`${Array.from(cleaned.value).length}/${LIMITS.description}`}>
            <Textarea id="alloc-desc" value={description} onChange={(e) => setDescription(e.target.value.slice(0, 1400))} />
          </Field>
          {error ? <FieldError>{error}</FieldError> : null}
          <Button type="submit" size="lg" className="w-full" loading={pending}>
            Submit proposal
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The treasury page's view of the Community Pool: how much of this guild's treasury earns there,
 * what it has earned, how the pool is split, and the two things anyone can do about it.
 */
export function PoolCard({ creatorId, handle, investedCost }: { creatorId: string; handle: string; investedCost?: Usd }) {
  const s = useSession();
  const web3 = useWeb3();
  const { push } = useToast();
  const { data, failed } = usePool(creatorId);
  const runChain = useChainRun();
  const [open, setOpen] = React.useState(false);
  const { pending, run } = usePending();

  if (!POOL_LIVE && !SAMPLE_DATA) return null;
  if (!data?.treasury) {
    return (
      <Card className="p-5">
        <MonoLabel>Community Pool</MonoLabel>
        <p className="mt-2 text-sm text-muted">{failed ? "The pool can't be read right now." : "Reading the pool…"}</p>
      </Card>
    );
  }
  const { pool, treasury } = data;
  const earned = investedCost === undefined ? undefined : treasury.invested - investedCost;
  const canAct = s.signedIn && s.hasCharacter;

  function rebalance() {
    return run(async () => {
      const r = await runChain(calls.rebalanceTreasury(BigInt(creatorId)));
      if (!r.ok) return push({ tone: "danger", title: "Couldn't rebalance", description: r.error });
      push({ tone: "success", title: "Treasury rebalanced", action: viewTx(r.tx) });
    });
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <MonoLabel>Community Pool</MonoLabel>
          <h2 className="mt-1 flex items-center gap-2 text-lg text-ink">
            <Sprout className="size-4 text-signal" aria-hidden /> Putting the treasury to work
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            The guild votes how much of its treasury earns yield. It is still treasury money: a payout pulls it straight back out.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canAct && !SAMPLE_DATA && needsRebalance(treasury) ? (
            <Button variant="ghost" size="sm" loading={pending} onClick={() => void rebalance()}>
              <RefreshCw aria-hidden /> Rebalance
            </Button>
          ) : null}
          {canAct ? (
            <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
              Propose a share
            </Button>
          ) : (
            <AuthDialog trigger={<Button variant="secondary" size="sm">Create your character to vote</Button>} />
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <Stat
          label="Earning in the pool"
          value={formatUsd(treasury.invested, { cents: "always" })}
          sub={`${pct(investedBps(treasury))} of the treasury · the guild voted ${pct(treasury.targetBps)}`}
        />
        {earned !== undefined ? (
          <Stat label="Earned so far" value={`${earned < 0n ? "−" : "+"}${formatUsd((earned < 0n ? -earned : earned) as Usd, { cents: "always" })}`} sub="what it is worth now, minus what went in" />
        ) : (
          <Stat label="Liquid" value={formatUsd(treasury.liquid, { cents: "always" })} sub="ready for payouts" />
        )}
        <Stat label="Pool yield" value={formatApr(blendedAprBps(pool))} sub={web3 ? "a year, simulated on testnet" : "a year, simulated for practice"} />
      </div>

      <PoolMixBar pool={pool} className="mt-5" />
      {pool.parked ? <p className="mt-3 text-sm text-pending">The pool is parked after an emergency exit: everything sits idle until it resumes.</p> : null}
      <p className={cn("mt-4 text-xs text-subtle")}>
        {web3
          ? "jagomoko’s curator sets the split, with liquid staking at most half, so at most a quarter of a treasury is ever exposed to the MON price. Testnet: the yield is simulated by mock contracts."
          : "jagomoko’s curator sets the split, with Growth at most half, so at most a quarter of a treasury ever moves with the market. Practice mode: the yield is simulated."}
      </p>

      <AllocateDialog creatorId={creatorId} handle={handle} treasury={treasury} open={open} onOpenChange={setOpen} />
    </Card>
  );
}
