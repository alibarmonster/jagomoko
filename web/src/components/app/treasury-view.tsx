"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { CONTRACTS, DEPLOYED, EXPLORER, explorerAddress } from "@/lib/chain/config";
import { SAMPLE_DATA } from "@/lib/config";
import { formatUsd, parseUsd, type Usd } from "@/lib/utils/money";
import { cleanText, LIMITS } from "@/lib/utils/sanitize";
import type { Creator, Player, Proposal } from "@/lib/data/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, Input, Textarea } from "@/components/ui/field";
import { SplitBar } from "@/components/ui/progress";
import { ExplorerLink } from "@/components/ui/explorer-link";
import { EmptyState } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/components/session";
import { Web3Only } from "@/components/experience";
import { usePending } from "@/hooks/use-pending";
import { viewTx } from "@/lib/chain/explorer";
import { AuthDialog } from "./auth-dialog";
import { PoolCard } from "./pool-card";
import { ProposalCard } from "./proposal-card";
import { SectionHeading } from "./section-heading";
import { useCelebrate } from "./reward";

function ProposeDialog({ creator, players, open, onOpenChange }: { creator: Creator; players: Player[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const s = useSession();
  const { push } = useToast();
  const celebrate = useCelebrate();
  const [amountText, setAmountText] = React.useState("");
  const [recipientId, setRecipientId] = React.useState(players[0]?.id ?? "");
  const [description, setDescription] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const { pending, run } = usePending();

  const amount: Usd | null = amountText ? parseUsd(amountText) : null;
  const cleaned = cleanText(description, LIMITS.description, { multiline: true });
  const over = amount !== null && amount > creator.treasuryBalance;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (amount === null || amount <= 0n) return setError("Enter an amount, like 25 or 12.50.");
    const recipient = players.find((p) => p.id === recipientId);
    if (!recipient) return setError("Choose who gets the money.");
    return run(async () => {
      const r = await s.actions.propose(creator.id, amount, { id: recipient.id, name: recipient.name }, description);
      if (!r.ok) return setError(r.error);
      setError(null);
      onOpenChange(false);
      setAmountText("");
      setDescription("");
      push({ tone: "success", title: "Proposal submitted", description: "The community has 24 hours to vote.", action: viewTx(r.tx) });
      if (s.state.character) celebrate(r.value, s.state.character.role);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Propose a payout</DialogTitle>
          <DialogDescription>Ask the community to spend some of the treasury. Everyone with XP votes, and the creator can veto during the beta.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <Field label="Amount" htmlFor="prop-amount" hint={`The treasury holds ${formatUsd(creator.treasuryBalance, { cents: "always" })}.`}>
            <Input id="prop-amount" prefixText="$" inputMode="decimal" placeholder="25" value={amountText} onChange={(e) => setAmountText(e.target.value.replace(/[^\d.]/g, "").slice(0, 10))} invalid={over} />
          </Field>
          {over ? <FieldError>That&rsquo;s more than the treasury holds right now, so it can&rsquo;t pass.</FieldError> : null}

          <div>
            <label htmlFor="prop-to" className="mb-1.5 block text-sm font-medium text-ink">
              Goes to
            </label>
            <select
              id="prop-to"
              value={recipientId}
              onChange={(e) => setRecipientId(e.target.value)}
              className="h-10 w-full rounded-sm border border-line-strong bg-surface px-3 text-sm text-ink hover:border-subtle focus-visible:border-signal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-tint"
            >
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.role}
                </option>
              ))}
            </select>
          </div>

          <Field label="What is it for?" htmlFor="prop-desc" counter={`${Array.from(cleaned.value).length}/${LIMITS.description}`}>
            <Textarea id="prop-desc" value={description} onChange={(e) => setDescription(e.target.value.slice(0, 1400))} placeholder="Clip bounty: best clutch of the week goes to…" />
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

/** The community treasury: where the money is, what's up for a vote, and what already got paid. */
export function TreasuryView({ creator, proposals, players }: { creator: Creator; proposals: Proposal[]; players: Player[] }) {
  const s = useSession();
  const [open, setOpen] = React.useState(false);
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name;

  const mine: Proposal[] = s.state.proposals.map((p) => ({
    id: p.id,
    creatorId: creator.id,
    proposer: "you",
    recipient: p.recipient,
    recipientName: p.recipientName,
    amount: p.amount,
    description: p.description,
    endsAt: p.at + 24 * 3_600_000,
    forWeight: 0n,
    againstWeight: 0n,
    voters: 0,
    status: "Active",
    createdAt: p.at,
  }));
  const active = [...mine, ...proposals.filter((p) => p.status === "Active")];
  const past = proposals.filter((p) => p.status !== "Active");

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-2xl text-ink">{creator.handle}&rsquo;s treasury</h1>
          <p className="mt-2 text-base text-muted">
            A slice of every tip and quest goes here. The community decides how it&rsquo;s spent, so it funds bounties, giveaways and things that make the stream better.
          </p>
        </div>
        {s.signedIn && s.hasCharacter ? (
          <Button onClick={() => setOpen(true)}>
            <Plus aria-hidden /> Propose a payout
          </Button>
        ) : (
          <AuthDialog trigger={<Button>Create your character to propose</Button>} />
        )}
      </header>

      <section aria-label="Treasury summary">
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-5">
            <p className="text-sm text-subtle">In the treasury</p>
            <p className="mt-1 font-mono text-3xl text-ink tnum">{formatUsd(creator.treasuryBalance, { cents: "always" })}</p>
            {creator.treasuryInvestedCost ? (
              <p className="mt-1 text-xs text-subtle">
                {formatUsd((creator.treasuryBalance - creator.treasuryInvestedCost) as Usd, { cents: "always" })} ready ·{" "}
                {formatUsd(creator.treasuryInvestedCost, { cents: "always" })} in the Community Pool
              </p>
            ) : null}
          </Card>
          <Card className="p-5">
            <p className="text-sm text-subtle">Community fund</p>
            <p className="mt-1 font-mono text-3xl text-ink tnum">{formatUsd(creator.communityBalance, { cents: "always" })}</p>
            <p className="mt-1 text-xs text-subtle">Pays juror fees and small bounties.</p>
          </Card>
          <Card className="p-5">
            <p className="text-sm text-subtle">How tips are split</p>
            <SplitBar split={creator} className="mt-3" />
          </Card>
        </div>
        {!SAMPLE_DATA && DEPLOYED ? (
          <Web3Only>
            <p className="mt-3 text-xs text-muted">
              This money is held in the SplitVault contract, counted per guild.{" "}
              <ExplorerLink href={explorerAddress(CONTRACTS.vault, { tokens: true })}>View on {EXPLORER.name}</ExplorerLink>
            </p>
          </Web3Only>
        ) : null}
      </section>

      <PoolCard creatorId={creator.id} handle={creator.handle} investedCost={creator.treasuryInvestedCost} />

      <Tabs defaultValue="active">
        <TabsList aria-label="Proposals">
          <TabsTrigger value="active">Open for voting ({active.length})</TabsTrigger>
          <TabsTrigger value="past">Past ({past.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="active">
          {active.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {active.map((p) => (
                <ProposalCard key={p.id} proposal={p} proposerName={p.proposer === "you" ? "you" : nameOf(p.proposer)} />
              ))}
            </div>
          ) : (
            <EmptyState title="Nothing to vote on" description="Anyone with a character can propose a payout." />
          )}
        </TabsContent>
        <TabsContent value="past">
          {past.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {past.map((p) => (
                <ProposalCard key={p.id} proposal={p} proposerName={nameOf(p.proposer)} className={cn("opacity-95")} />
              ))}
            </div>
          ) : (
            <EmptyState title="No past proposals" />
          )}
        </TabsContent>
      </Tabs>

      <SectionHeading title="How voting works" />
      <ul className="max-w-2xl list-disc space-y-1.5 pl-5 text-sm text-muted">
        <li>One character, one vote, weighted by the square root of your XP so no one can buy control.</li>
        <li>A proposal passes when more weight votes for it than against and it reaches the minimum turnout.</li>
        <li>If it passes, it happens straight from the treasury: the payout is sent, or the share moves into the Community Pool. Nobody has to approve it by hand.</li>
      </ul>

      <ProposeDialog creator={creator} players={players} open={open} onOpenChange={setOpen} />
    </div>
  );
}
