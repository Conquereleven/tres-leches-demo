import { useLanguage as useCustomerLanguage } from "./localization";
import { useState } from "react";
/** Preserve an editing draft; commit complete integers, restore invalid drafts on blur. */
export function QuantityInput({
  value,
  min = 1,
  max,
  label,
  onChange,
}: {
  value: number;
  min?: number;
  max: number;
  label: string;
  onChange: (value: number) => void;
}) {
  const { text: localize } = useCustomerLanguage();

  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      className="b-quantity-input"
      aria-label={localize(label)}
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
        if (text && n >= min && n <= max) onChange(n);
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
              Math.max(min, value + (event.key === "ArrowUp" ? 1 : -1)),
            ),
          );
        }
      }}
      aria-description={localize(
        min > 1
          ? `Whole number from 6 to ${max}`
          : `Whole number from 1 to ${max}`,
      )}
    />
  );
}
