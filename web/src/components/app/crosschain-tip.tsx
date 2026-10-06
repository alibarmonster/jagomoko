"use client";

import * as React from "react";
import { Check, Loader2, Wallet } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatUsd, usd, type Usd } from "@/lib/money";
import { cleanText, LIMITS } from "@/lib/sanitize";
import { tipMemo } from "@/lib/tip-memo";
import { explorerTx, TIP_SOURCES, type TipSource } from "@/lib/chain/config";
import { formatEth, layerZeroScanTx, MAX_MEMO_BYTES, memoBytes, type TipLanding, type TipQuote } from "@/lib/crosschain";
import { fetchTipLanding, fetchTipQuote } from "@/lib/crosschain-client";
import { connectWallet, discoverWallets, sendTip, switchChain, walletErrorMessage, type InjectedWallet, type SentTip } from "@/lib/crosschain-wallet";
import { shortAddress } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { AmountPicker } from "@/components/ui/amount-picker";
import { Field, FieldError, Input } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { ExplorerLink } from "@/components/ui/explorer-link";
import { MonoLabel } from "@/components/ui/status-pill";

const LANDING_POLL_MS = 4_000;
const LANDING_GIVE_UP_MS = 15 * 60_000;

/** Reads the ETH price and the LayerZero fee for the tip being typed, a moment after it settles. */
function useQuote(source: TipSource, creatorId: string, amount: Usd | null, memo: string) {
  const [quote, setQuote] = React.useState<TipQuote | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const bytes = memoBytes(memo);
  React.useEffect(() => {
    if (amount === null || amount <= 0n) return setQuote(null);
    const ctrl = new AbortController();
    const read = () =>
      fetchTipQuote({ chainId: source.chainId, creatorId, usd: amount, memoBytes: Math.min(bytes, MAX_MEMO_BYTES) }, ctrl.signal)
        .then((q) => {
          setQuote(q);
          setError(null);
        })
        .catch((e: unknown) => {
          if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "The price can't be read right now.");
        });
    const first = window.setTimeout(read, 350);
    const again = window.setInterval(read, 30_000); // the price and the fee drift
    return () => {
      ctrl.abort();
      window.clearTimeout(first);
      window.clearInterval(again);
    };
  }, [source.chainId, creatorId, amount, bytes]);
  return { quote, error };
}

/** Follows a sent tip until the index sees it land on Monad (or bounce). */
function useLanding(guid: string | undefined) {
  const [landing, setLanding] = React.useState<TipLanding>({ status: "pending" });
  const [gaveUp, setGaveUp] = React.useState(false);
  React.useEffect(() => {
    if (!guid) return;
    setLanding({ status: "pending" });
    setGaveUp(false);
    const ctrl = new AbortController();
    const started = Date.now();
    let timer = 0;
    const tick = async () => {
      const next = await fetchTipLanding(guid, ctrl.signal).catch(() => ({ status: "pending" }) as TipLanding);
      if (ctrl.signal.aborted) return;
      if (next.status !== "pending") return setLanding(next);
      if (Date.now() - started > LANDING_GIVE_UP_MS) return setGaveUp(true);
      timer = window.setTimeout(tick, LANDING_POLL_MS);
    };
    void tick();
    return () => {
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [guid]);
  return { landing, gaveUp };
}

type Step = "done" | "active" | "waiting" | "failed";

function StepRow({ state, title, children }: { state: Step; title: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
          state === "done" && "border-success bg-success text-white",
          state === "active" && "border-signal text-signal",
          state === "waiting" && "border-line-strong text-faint",
          state === "failed" && "border-danger text-danger",
        )}
        aria-hidden
      >
        {state === "done" ? <Check className="size-3" /> : state === "active" ? <Loader2 className="size-3 animate-spin" /> : null}
      </span>
      <div className="min-w-0 text-sm">
        <p className={cn(state === "waiting" ? "text-subtle" : "text-ink")}>{title}</p>
        {children ? <div className="mt-0.5 text-xs text-muted">{children}</div> : null}
      </div>
    </li>
  );
}

/**
 * Tip a creator from another chain (contract v2). The viewer pays ETH on Sepolia from their own
 * wallet; TipSender prices it with Chainlink and LayerZero brings it to Monad, where it is split like
 * any tip. No jagomoko account is needed: the tip is credited to the wallet's address.
 */
export function CrossChainTip({
  creatorId,
  creatorName,
  source = TIP_SOURCES[0]!,
  className,
}: {
  creatorId: string;
  creatorName: string;
  source?: TipSource;
  className?: string;
}) {
  const uid = React.useId();
  const [amount, setAmount] = React.useState<Usd | null>(usd(5));
  const [memo, setMemo] = React.useState("");
  const [anonymous, setAnonymous] = React.useState(false);
  const [wallets, setWallets] = React.useState<InjectedWallet[]>([]);
  const [wallet, setWallet] = React.useState<InjectedWallet | null>(null);
  const [account, setAccount] = React.useState<`0x${string}` | null>(null);
  const [busy, setBusy] = React.useState<"connect" | "send" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState<(SentTip & { amount: Usd }) | null>(null);
  const [pageUrl, setPageUrl] = React.useState("");

  React.useEffect(() => discoverWallets(setWallets), []);
  React.useEffect(() => setPageUrl(`${window.location.host}${window.location.pathname}${window.location.search}`), []);

  const cleaned = cleanText(memo, LIMITS.memo);
  const message = tipMemo(cleaned.value, anonymous);
  const { quote, error: quoteError } = useQuote(source, creatorId, amount, message);
  const { landing, gaveUp } = useLanding(sent?.guid);
  const tooBig = memoBytes(message) > MAX_MEMO_BYTES;
  const outOfRange = quote && amount !== null && (amount < quote.minUsd || amount > quote.maxUsd);

  async function connect(w: InjectedWallet) {
    setBusy("connect");
    setError(null);
    try {
      setAccount(await connectWallet(w));
      setWallet(w);
    } catch (e) {
      setError(walletErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    if (!wallet || !account || !quote || amount === null) return;
    setBusy("send");
    setError(null);
    try {
      await switchChain(wallet, source.chainId);
      const result = await sendTip({ wallet, account, source, wei: quote.wei, fee: quote.fee, creatorId: BigInt(creatorId), memo: message });
      setSent({ ...result, amount });
      setMemo("");
    } catch (e) {
      setError(walletErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  // ---- after sending: where the tip is -------------------------------------------------------------
  if (sent) {
    const landed = landing.status === "landed";
    const bounced = landing.status === "bounced";
    return (
      <div className={className}>
        <MonoLabel>From {source.short}</MonoLabel>
        <h2 className="mt-1 text-lg text-ink">
          {landed ? `${creatorName} got your ${formatUsd(sent.amount)}` : bounced ? "Your tip came back" : `Sending ${formatUsd(sent.amount)} to ${creatorName}`}
        </h2>
        <ol className="mt-4 space-y-3">
          <StepRow state="done" title={`Paid on ${source.name}`}>
            <ExplorerLink href={`${source.explorer}/tx/${sent.hash}`}>View the payment</ExplorerLink>
          </StepRow>
          <StepRow state={landed || bounced ? "done" : gaveUp ? "failed" : "active"} title="LayerZero carries it to Monad">
            <ExplorerLink href={layerZeroScanTx(sent.hash)}>Follow it on LayerZero Scan</ExplorerLink>
            {gaveUp && !landed && !bounced ? <span className="block">It is taking longer than usual; it still lands once LayerZero delivers it.</span> : null}
          </StepRow>
          <StepRow state={landed ? "done" : bounced ? "failed" : "waiting"} title={bounced ? "It could not reach this guild" : "Lands in the guild's split"}>
            {landed && landing.txHash ? <ExplorerLink href={explorerTx(landing.txHash)}>View it on Monad</ExplorerLink> : null}
            {bounced ? <span>The practice dollars went to your own address on Monad instead.</span> : null}
          </StepRow>
        </ol>
        {landed ? (
          <p className="mt-4 text-sm text-muted">It shows on stream like any tip{anonymous ? ", as Anonymous" : ""}.</p>
        ) : null}
        <Button variant="secondary" size="sm" className="mt-4" onClick={() => setSent(null)}>
          Send another
        </Button>
      </div>
    );
  }

  // ---- the form --------------------------------------------------------------------------------------
  const ready = wallet && account && quote && amount !== null && !outOfRange && !tooBig;
  return (
    <div className={className}>
      <MonoLabel>From {source.short}</MonoLabel>
      <h2 className="mt-1 text-lg text-ink">Tip {creatorName} with ETH</h2>
      <p className="mt-0.5 text-sm text-muted">
        Pay from your own wallet on {source.name}. LayerZero brings it to Monad in a minute or two, and it is split like any tip. No account needed.
      </p>

      <AmountPicker value={amount} onChange={setAmount} id={`${uid}-amount`} className="mt-4" />

      <Field label="Say something (optional)" htmlFor={`${uid}-memo`} counter={`${Array.from(cleaned.value).length}/${LIMITS.memo}`} className="mt-4">
        <Input id={`${uid}-memo`} value={memo} maxLength={200} placeholder="gg from Sepolia" onChange={(e) => setMemo(e.target.value)} invalid={tooBig} />
      </Field>

      <label htmlFor={`${uid}-anon`} className="mt-4 flex cursor-pointer items-start gap-3 text-sm text-ink">
        <Switch id={`${uid}-anon`} checked={anonymous} onCheckedChange={setAnonymous} className="mt-0.5" />
        <span>
          Hide my name
          <span className="mt-0.5 block text-xs text-muted">
            {anonymous ? "You’ll show as Anonymous on stream. The wallet address is still public on both chains." : "The stream shows your wallet address."}
          </span>
        </span>
      </label>

      <div className="mt-4 rounded-md bg-sunken p-3 text-sm" aria-live="polite">
        {quote && amount !== null ? (
          <>
            <p className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-subtle">You pay</span>
              <span className="font-mono text-ink tnum">{formatEth(quote.wei)} ETH</span>
            </p>
            <p className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-subtle">LayerZero fee</span>
              <span className="font-mono text-ink tnum">≈ {formatEth(quote.fee)} ETH</span>
            </p>
            <p className="mt-2 font-mono text-2xs text-subtle">
              1 ETH = {formatUsd(quote.usdPerEth)} (Chainlink) · any fee left over comes back to you
            </p>
          </>
        ) : (
          <p className="text-subtle">{quoteError ?? (amount === null ? "Pick an amount." : "Reading the price…")}</p>
        )}
      </div>

      {outOfRange && quote ? (
        <FieldError className="mt-3">
          Tips from {source.short} are {formatUsd(quote.minUsd)} to {formatUsd(quote.maxUsd)}.
        </FieldError>
      ) : null}
      {tooBig ? <FieldError className="mt-3">That message is too long to send across chains.</FieldError> : null}
      {error ? <FieldError className="mt-3">{error}</FieldError> : null}

      <div className="mt-4 space-y-2">
        {wallet && account ? (
          <>
            <p className="flex items-center gap-2 text-xs text-muted">
              <Wallet className="size-3.5" aria-hidden /> {wallet.name} · <span className="font-mono">{shortAddress(account)}</span>
            </p>
            <Button size="lg" className="w-full" disabled={!ready} loading={busy === "send"} onClick={() => void send()}>
              {amount === null ? "Pick an amount" : `Tip ${formatUsd(amount)} from ${source.short}`}
            </Button>
            {busy === "send" ? <p className="text-center text-xs text-muted">Confirm in your wallet, then wait for {source.short} to include it.</p> : null}
          </>
        ) : wallets.length > 0 ? (
          wallets.map((w) => (
            <Button key={w.id} variant="secondary" size="lg" className="w-full" loading={busy === "connect"} onClick={() => void connect(w)}>
              {/* eslint-disable-next-line @next/next/no-img-element -- the wallet's own announced icon (a data: URI) */}
              {w.icon ? <img src={w.icon} alt="" width={20} height={20} className="size-5" /> : <Wallet aria-hidden />}
              Connect {w.name}
            </Button>
          ))
        ) : (
          <div className="rounded-md border border-line p-3 text-sm text-muted">
            <p>No wallet in this browser.</p>
            <p className="mt-1">
              On a phone, open this page in your wallet&rsquo;s browser:{" "}
              <a className="text-ink underline underline-offset-2" href={`https://metamask.app.link/dapp/${pageUrl}`}>
                open in MetaMask
              </a>
              .
            </p>
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-subtle">Testnet: Sepolia ETH has no real value, and the creator receives practice dollars on Monad.</p>
    </div>
  );
}
