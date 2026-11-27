import { useLanguage } from "./localization";
import { localizedKey } from "./locales/engine";
import { useEffect, useId, useState } from "react";

function wholeQuantity(draft: string) {
  const digits = draft.replace(/[٠-٩۰-۹]/g, (digit) =>
    String(digit.charCodeAt(0) & 15),
  );
  return /^[0-9]+$/.test(digits) ? Number(digits) : NaN;
}

/** Keep the field's text independent of the last valid, persisted quantity. */
export function QuantityInput({
  value,
  min = 1,
  max,
  label,
  onChange,
  onDraftValidityChange,
  className = "b-quantity-input",
}: {
  value: number;
  min?: number;
  max: number;
  label: string;
  onChange: (value: number) => void;
  /** Cart mode defers persistence until the edit is finished. */
  onDraftValidityChange?: (valid: boolean) => void;
  className?: string;
}) {
  const { language } = useLanguage();
  const errorId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [showError, setShowError] = useState(false);
  const quantity = draft === null ? value : wholeQuantity(draft);
  const cartEdit = onDraftValidityChange !== undefined;
  const valid =
    Number.isSafeInteger(quantity) && quantity >= min && quantity <= max;
  const describeRange = localizedKey("checkout:quantity_range", language, {
    0: min,
    1: max,
  });
  const error =
    cartEdit && showError && !valid
      ? Number.isNaN(quantity)
        ? localizedKey("checkout:quantity_whole_number", language)
        : describeRange
      : null;
  useEffect(() => {
    onDraftValidityChange?.(draft === null || valid);
  }, [draft, valid, onDraftValidityChange]);
  useEffect(() => () => onDraftValidityChange?.(true), [onDraftValidityChange]);

  return (
    <>
      <input
        className={className}
        aria-label={label}
        role={cartEdit ? "spinbutton" : undefined}
        aria-valuemin={cartEdit ? min : undefined}
        aria-valuemax={cartEdit ? max : undefined}
        aria-valuenow={cartEdit ? (valid ? quantity : value) : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        aria-description={error ? undefined : describeRange}
        type="text"
        inputMode="numeric"
        pattern={cartEdit ? undefined : "[0-9]*"}
        maxLength={cartEdit ? undefined : 3}
        autoComplete="off"
        value={draft ?? String(value)}
        onChange={(event) => {
          const text = event.target.value;
          if (!cartEdit && !/^\d*$/.test(text)) return;
          setDraft(text);
          if (!cartEdit) {
            const n = wholeQuantity(text);
            if (Number.isSafeInteger(n) && n >= min && n <= max) onChange(n);
          }
        }}
        onBlur={() => {
          if (cartEdit && draft !== null && valid) onChange(quantity);
          if (valid || !cartEdit) setDraft(null);
          setShowError(!valid);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            setDraft(null);
            setShowError(false);
          }
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            if (max < min) return;
            setDraft(null);
            setShowError(false);
            onChange(
              Math.min(
                max,
                Math.max(
                  min,
                  (valid ? quantity : value) +
                    (event.key === "ArrowUp" ? 1 : -1),
                ),
              ),
            );
          }
        }}
      />
      {error && (
        <small id={errorId} role="alert">
          {error}
        </small>
      )}
    </>
  );
}
