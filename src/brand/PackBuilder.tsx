import "./pack-builder.css";
import { useId } from "react";
import {
  packSpec,
  personalizedPackEnabled,
  componentName,
  normalizeComposition,
  type Composition,
  type CommerceLine,
  type PackSnapshot,
  validPackSnapshot,
} from "../../shared/pack-composition";
import { packCopy } from "../../shared/pack-copy";
import { useLanguage } from "./localization";
import type { CheckoutConfig } from "./cart";

export function packComplete(
  productId: string,
  composition: Composition,
  config: CheckoutConfig,
) {
  const spec = packSpec(productId);
  const allowed =
    config.personalizedPacks?.rules.find((r) => r.packSkuId === productId)
      ?.componentSkuIds ?? [];
  return (
    !!spec &&
    personalizedPackEnabled(productId, config.personalizedPacks) &&
    composition.reduce((n, c) => n + c.units, 0) === spec.capacity &&
    composition.every(
      (c) =>
        Number.isInteger(c.units) &&
        c.units >= 0 &&
        allowed.includes(c.componentSkuId),
    )
  );
}
export function PackBuilder({
  productId,
  config,
  value,
  onChange,
}: {
  productId: string;
  config: CheckoutConfig;
  value: Composition;
  onChange: (value: Composition) => void;
}) {
  const { language } = useLanguage(),
    copy = packCopy(language),
    id = useId();
  const spec = packSpec(productId);
  if (!spec) return null;
  const allowed =
    config.personalizedPacks?.rules.find((r) => r.packSkuId === productId)
      ?.componentSkuIds ?? [];
  const selected = value.reduce((n, c) => n + c.units, 0);
  const change = (componentSkuId: string, units: number) =>
    onChange(
      normalizeComposition([
        ...value.filter((c) => c.componentSkuId !== componentSkuId),
        { componentSkuId, units },
      ]),
    );
  return (
    <fieldset className="b-pack-builder" aria-describedby={`${id}-status`}>
      <legend>{copy.choose}</legend>
      {!allowed.length && <p role="status">{copy.unavailable}</p>}
      {spec.components
        .filter(
          (c) =>
            allowed.includes(c.componentSkuId) ||
            value.some(
              (v) => v.componentSkuId === c.componentSkuId && v.units > 0,
            ),
        )
        .map((c) => {
          const units =
            value.find((x) => x.componentSkuId === c.componentSkuId)?.units ??
            0;
          const label = componentName(c.componentSkuId, language);
          const enabled = allowed.includes(c.componentSkuId);
          return (
            <div className="b-pack-flavor" key={c.componentSkuId}>
              <span>
                {label}
                {!enabled && <small role="status"> · {copy.disabled}</small>}
              </span>
              <div className="b-qty" role="group" aria-label={label}>
                <button
                  type="button"
                  aria-label={`− ${label}`}
                  disabled={!units}
                  onClick={() => change(c.componentSkuId, units - 1)}
                >
                  −
                </button>
                <input
                  className="b-quantity-input"
                  aria-label={label}
                  inputMode="numeric"
                  type="number"
                  min={0}
                  max={enabled ? spec.capacity : units}
                  value={units}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (
                      Number.isInteger(n) &&
                      n >= 0 &&
                      n <= spec.capacity &&
                      (enabled || n <= units) &&
                      selected - units + n <= spec.capacity
                    )
                      change(c.componentSkuId, n);
                  }}
                />
                <button
                  type="button"
                  aria-label={`+ ${label}`}
                  disabled={!enabled || selected >= spec.capacity}
                  onClick={() => change(c.componentSkuId, units + 1)}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      <p id={`${id}-status`} role="status" aria-live="polite">
        {selected} / {spec.capacity} {copy.selected}
      </p>
      {!packComplete(productId, value, config) && (
        <p className="b-caption">{copy.incomplete}</p>
      )}
    </fieldset>
  );
}
export function CompositionDetails({
  line,
}: {
  line: CommerceLine & { packSnapshot?: PackSnapshot };
}) {
  const { language } = useLanguage();
  if (!line.composition) return null;
  const snapshot = line.packSnapshot;
  if (snapshot && !validPackSnapshot(line))
    return <p role="alert">{packCopy(language).unavailable}</p>;
  return (
    <span className="b-pack-composition">
      {packCopy(language).perBox}:{" "}
      {line.composition
        .map(
          (c) =>
            `${snapshot ? (snapshot.components.find((s) => s.componentSkuId === c.componentSkuId)?.names?.[language] ?? snapshot.components.find((s) => s.componentSkuId === c.componentSkuId)?.name ?? c.componentSkuId) : componentName(c.componentSkuId, language)} × ${c.units}`,
        )
        .join(" · ")}
    </span>
  );
}
