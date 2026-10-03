"use client";

import * as React from "react";
import { RadioGroup } from "radix-ui";
import { cn } from "@/lib/cn";
import { formatUsd, parseUsd, usd, type Usd } from "@/lib/money";
import { FieldError, Input } from "./field";

const chip =
  "inline-flex h-9 items-center justify-center rounded-sm border px-3.5 font-mono text-sm font-medium tnum transition duration-(--dur-micro) ease-out " +
  "border-line-strong bg-surface text-ink hover:bg-sunken " +
  "data-[state=checked]:border-signal data-[state=checked]:bg-signal-tint";

/**
 * Preset chips + a custom amount. Keyboard: arrow keys move between chips
 * (Radix radio group). The value is micro-dollars; null means "no valid amount yet".
 */
export function AmountPicker({
  value,
  onChange,
  presets = [1, 5, 10, 25],
  error,
  id = "amount",
  label = "Amount",
  className,
}: {
  value: Usd | null;
  onChange: (value: Usd | null) => void;
  presets?: number[];
  error?: string | null;
  id?: string;
  label?: string;
  className?: string;
}) {
  const presetValues = presets.map((p) => usd(p));
  const isPreset = value !== null && presetValues.includes(value);
  const [custom, setCustom] = React.useState(!isPreset && value !== null);
  const [text, setText] = React.useState(() => (value !== null && !isPreset ? formatUsd(value, { cents: "auto" }).replace("$", "") : ""));
  const inputRef = React.useRef<HTMLInputElement>(null);

  const selected = custom ? "custom" : isPreset ? String(presets[presetValues.indexOf(value!)]) : "";

  function select(next: string) {
    if (next === "custom") {
      setCustom(true);
      onChange(parseUsd(text));
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }
    setCustom(false);
    onChange(usd(Number(next)));
  }

  function onText(raw: string) {
    // digits and a single dot, at most two decimals
    let t = raw.replace(/[^\d.]/g, "");
    const dot = t.indexOf(".");
    if (dot !== -1) t = t.slice(0, dot + 1) + t.slice(dot + 1).replace(/\./g, "").slice(0, 2);
    setText(t);
    const parsed = t === "" || t === "." ? null : parseUsd(t);
    onChange(parsed !== null && parsed > 0n ? parsed : null);
  }

  return (
    <div className={className}>
      <span id={`${id}-label`} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </span>
      <RadioGroup.Root value={selected} onValueChange={select} aria-labelledby={`${id}-label`} className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <RadioGroup.Item key={p} value={String(p)} className={chip} aria-label={`$${p}`}>
            ${p}
          </RadioGroup.Item>
        ))}
        <RadioGroup.Item value="custom" className={cn(chip, "font-sans")}>
          Custom
        </RadioGroup.Item>
      </RadioGroup.Root>
      {custom ? (
        <div className="mt-2.5">
          <Input
            ref={inputRef}
            id={id}
            prefixText="$"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={text}
            onChange={(e) => onText(e.target.value)}
            invalid={!!error}
            aria-label="Custom amount in dollars"
            aria-describedby={error ? `${id}-error` : undefined}
            className="max-w-[10rem]"
          />
        </div>
      ) : null}
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </div>
  );
}
