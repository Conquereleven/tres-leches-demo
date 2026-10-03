import { useState } from "react";
/** Preserve an editing draft; commit complete integers, restore invalid drafts on blur. */
export function QuantityInput({
  value,
  max,
  label,
  onChange,
}: {
  value: number;
  max: number;
  label: string;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      className="b-quantity-input"
      aria-label={label}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      maxLength={3}
      value={draft ?? String(value)}
      onChange={(event) => {
        const text = event.target.value;
        if (!/^\d*$/.test(text)) return;
        setDraft(text);
        const n = Number(text);
        if (text && n >= 1 && n <= max) onChange(n);
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          setDraft(null);
          onChange(
            Math.min(
              max,
              Math.max(1, value + (event.key === "ArrowUp" ? 1 : -1)),
            ),
          );
        }
      }}
      aria-description={`Whole number from 1 to ${max}`}
    />
  );
}
