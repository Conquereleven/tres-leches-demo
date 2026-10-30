import { useEffect, useId, useMemo, useRef, useState } from "react";
import { exactArea, searchAreas } from "../../shared/area-search";
import { CustomerCopy, useLanguage } from "./localization";
export type DeliveryAreaOption = {
  id: string;
  name: string;
  aliases?: string[];
  minOrderAed: number;
  deliveryPolicy?: {
    mode: "flexible";
    freeDeliveryThresholdFils: number;
    belowThresholdFeeFils: number;
  };
};
/**
 * Type-to-find delivery area. What the customer types only filters the list of
 * approved areas; the form's value is always the chosen area's id (or empty),
 * and the minimum shown and charged comes from that area, never from the text.
 */
export function AreaField({
  areas,
  value,
  disabled,
  onChange,
  onNoMatch,
}: {
  areas: DeliveryAreaOption[];
  /** Canonical area id, or "" when nothing is chosen. */
  value: string;
  disabled?: boolean;
  onChange: (id: string) => void;
  /** Search evidence only; never a claim about geographic delivery coverage. */
  onNoMatch: (noMatch: boolean) => void;
}) {
  const { text: localize } = useLanguage();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const selected = areas.find((area) => area.id === value);
  const [text, setText] = useState(selected?.name ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // A value set elsewhere (restored draft, verified address) shows its name.
  useEffect(() => {
    if (selected) setText(selected.name);
  }, [selected]);
  const typed = text.trim();
  const options = useMemo(
    () =>
      typed && typed !== selected?.name
        ? searchAreas(areas, typed, 10).map((match) => match.area)
        : areas,
    [areas, typed, selected],
  );
  const noMatch = !selected && typed.length >= 2 && options.length === 0;
  const activeIndex = Math.min(active, Math.max(0, options.length - 1));
  useEffect(() => onNoMatch(noMatch), [noMatch, onNoMatch]);
  // Native validation: the form cannot proceed on text that is not an area.
  useEffect(() => {
    input.current?.setCustomValidity(
      selected
        ? ""
        : localize(
            noMatch
              ? "We couldn't find that area. Try another spelling or contact us."
              : "Choose your delivery area from the list.",
          ),
    );
  }, [selected, noMatch, localize]);
  const choose = (area: DeliveryAreaOption) => {
    setText(area.name);
    setActive(areas.findIndex((option) => option.id === area.id));
    setOpen(false);
    onChange(area.id);
  };
  const label = (area: DeliveryAreaOption) =>
    `${area.name} ${localize(area.deliveryPolicy ? "— Free delivery from AED" : "— Minimum AED")} ${area.minOrderAed}`;
  return (
    <div className="b-area-field">
      <input
        ref={input}
        className="b-input"
        type="text"
        role="combobox"
        required
        disabled={disabled}
        autoComplete="off"
        autoCapitalize="words"
        spellCheck={false}
        enterKeyHint="done"
        placeholder={localize("Start typing your area")}
        aria-label={localize("Delivery area")}
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={
          open && options[activeIndex]
            ? `${id}-${options[activeIndex].id}`
            : undefined
        }
        aria-describedby={`${id}-status`}
        value={text}
        onFocus={() => {
          setActive(
            Math.max(
              0,
              areas.findIndex((area) => area.id === value),
            ),
          );
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          setOpen(true);
          // An exact name or alias selects itself; anything else is unchosen.
          const exact = exactArea(areas, next);
          // Once its canonical label is shown, options contains the full list.
          // Enter must keep that exact selection rather than jump to row zero.
          setActive(
            exact ? areas.findIndex((area) => area.id === exact.id) : 0,
          );
          onChange(exact?.id ?? "");
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            if (open) event.stopPropagation();
            return setOpen(false);
          }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) return setOpen(true);
            if (!options.length) return;
            const step = event.key === "ArrowDown" ? 1 : -1;
            setActive((at) => (at + step + options.length) % options.length);
          }
          if (event.key === "Enter" && open && options[activeIndex]) {
            // Choosing an area must not submit the form.
            event.preventDefault();
            choose(options[activeIndex]);
          }
        }}
      />
      <ul
        id={`${id}-list`}
        role="listbox"
        aria-label={localize("Delivery area")}
        className="b-area-options"
        hidden={!open || !options.length}
      >
        {options.map((area, index) => (
          <li
            key={area.id}
            id={`${id}-${area.id}`}
            role="option"
            aria-selected={area.id === value}
            data-active={index === activeIndex || undefined}
            // pointerdown, so the choice lands before the input's blur closes the list.
            onPointerDown={(event) => {
              event.preventDefault();
              choose(area);
            }}
            // Assistive technologies can activate an option without pointerdown.
            onClick={() => choose(area)}
            ref={(element) => {
              if (index === activeIndex && open)
                element?.scrollIntoView?.({ block: "nearest" });
            }}
          >
            <span>{area.name}</span>
            <small>
              <CustomerCopy>
                {area.deliveryPolicy
                  ? "— Free delivery from AED"
                  : "— Minimum AED"}
              </CustomerCopy>{" "}
              {area.minOrderAed}
            </small>
          </li>
        ))}
      </ul>
      <p id={`${id}-status`} className="b-caption" role="status">
        {selected ? (
          label(selected)
        ) : noMatch ? (
          <CustomerCopy>
            We couldn't find that area. Try another spelling or contact us.
          </CustomerCopy>
        ) : typed ? (
          <CustomerCopy>Choose your delivery area from the list.</CustomerCopy>
        ) : (
          ""
        )}
      </p>
    </div>
  );
}
