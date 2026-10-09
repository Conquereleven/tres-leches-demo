import { useEffect, useId, useMemo, useRef, useState } from "react";
import { exactArea, searchAreas } from "../../shared/area-search";
import { CustomerCopy, useLanguage } from "./localization";
export type DeliveryAreaOption = {
  id: string;
  name: string;
  aliases?: string[];
  minOrderAed: number;
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
  onUnsupported,
}: {
  areas: DeliveryAreaOption[];
  /** Canonical area id, or "" when nothing is chosen. */
  value: string;
  disabled?: boolean;
  onChange: (id: string) => void;
  /** True while the typed text matches no approved area. */
  onUnsupported: (unsupported: boolean) => void;
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
  const unsupported = !selected && typed.length >= 2 && options.length === 0;
  useEffect(() => onUnsupported(unsupported), [unsupported, onUnsupported]);
  // Native validation: the form cannot proceed on text that is not an area.
  useEffect(() => {
    input.current?.setCustomValidity(
      selected
        ? ""
        : localize(
            unsupported
              ? "We don't currently deliver to this area."
              : "Choose your delivery area from the list.",
          ),
    );
  }, [selected, unsupported, localize]);
  const choose = (area: DeliveryAreaOption) => {
    setText(area.name);
    setOpen(false);
    onChange(area.id);
  };
  const label = (area: DeliveryAreaOption) =>
    `${area.name} ${localize("— Minimum AED")} ${area.minOrderAed}`;
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
          open && options[active] ? `${id}-${options[active].id}` : undefined
        }
        aria-describedby={`${id}-status`}
        value={text}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          setActive(0);
          setOpen(true);
          // An exact name or alias selects itself; anything else is unchosen.
          const exact = exactArea(areas, next);
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
          if (event.key === "Enter" && open && options[active]) {
            // Choosing an area must not submit the form.
            event.preventDefault();
            choose(options[active]);
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
            data-active={index === active || undefined}
            // pointerdown, so the choice lands before the input's blur closes the list.
            onPointerDown={(event) => {
              event.preventDefault();
              choose(area);
            }}
            ref={(element) => {
              if (index === active && open)
                element?.scrollIntoView?.({ block: "nearest" });
            }}
          >
            <span>{area.name}</span>
            <small>
              <CustomerCopy>— Minimum AED</CustomerCopy> {area.minOrderAed}
            </small>
          </li>
        ))}
      </ul>
      <p id={`${id}-status`} className="b-caption" role="status">
        {selected ? (
          label(selected)
        ) : unsupported ? (
          <CustomerCopy>We don't currently deliver to this area.</CustomerCopy>
        ) : typed ? (
          <CustomerCopy>Choose your delivery area from the list.</CustomerCopy>
        ) : (
          ""
        )}
      </p>
    </div>
  );
}
