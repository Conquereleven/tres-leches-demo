import { useLanguage as useCustomerLanguage } from "./localization";
import { useEffect, useId, useRef, useState } from "react";
import { CustomerCopy } from "./localization";
type Suggestion = { id: string; label: string };
export type AddressSelection = {
  address: string;
  building: string;
  addressRef: string;
  status: "VERIFIED" | "COMMUNITY_UNRESOLVED";
  zoneId?: string;
  name?: string;
  minOrderAed?: number;
};
async function request<T>(
  path: string,
  data: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/api/checkout/address/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal,
  }).catch((error: unknown) => {
    if (signal?.aborted) throw error;
    throw new Error(
      "Address verification is unavailable. Try again or choose pickup.",
    );
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error ??
        "Address verification is unavailable. Try again or choose pickup.",
    );
  return result;
}
export function AddressAutocomplete({
  value,
  verified,
  onChange,
  onSelected,
}: {
  value: string;
  verified: boolean;
  onChange: (value: string) => void;
  onSelected: (selection: AddressSelection) => void;
}) {
  const { text: localize } = useCustomerLanguage();

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const revision = useRef(0);
  const stateId = useId();
  const [searched, setSearched] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setSuggestions([]);
    setSearched(false);
    setBusy(false);
    if (verified || value.trim().length < 3) return () => controller.abort();
    const timer = setTimeout(() => {
      setBusy(true);
      setError("");
      void request<{ suggestions: Suggestion[] }>(
        "suggestions",
        { query: value },
        controller.signal,
      )
        .then((data) => {
          if (!controller.signal.aborted) {
            setSuggestions(data.suggestions);
            setSearched(true);
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setBusy(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, verified]);
  const choose = async (id: string) => {
    const current = ++revision.current;
    setBusy(true);
    setError("");
    try {
      const selected = await request<AddressSelection>("select", { id });
      if (current === revision.current) {
        onSelected(selected);
        setSuggestions([]);
      }
    } catch (e) {
      if (current === revision.current)
        setError(
          e instanceof Error ? e.message : "Try selecting your address again.",
        );
    } finally {
      if (current === revision.current) setBusy(false);
    }
  };
  return (
    <>
      <input
        required
        minLength={5}
        maxLength={300}
        autoComplete="off"
        value={value}
        aria-describedby={stateId}
        aria-busy={busy}
        onChange={(e) => {
          revision.current++;
          setBusy(false);
          setError("");
          onChange(e.target.value);
        }}
      />
      <span
        id={stateId}
        data-testid="address-verification-state"
        role="status"
        className="b-caption"
      >
        <CustomerCopy>
          {verified
            ? "Verified address"
            : busy
              ? "Checking address…"
              : searched && suggestions.length === 0
                ? "No verified address suggestions are available. Try another search, contact 3L or choose pickup."
                : "Unverified address — select a suggestion."}
        </CustomerCopy>
      </span>
      {error && (
        <span role="alert">
          <CustomerCopy>{error}</CustomerCopy>
        </span>
      )}
      {suggestions.length > 0 && (
        <span
          className="b-address-suggestions"
          role="group"
          aria-label={localize("Address suggestions")}
        >
          {suggestions.map((s) => (
            <button type="button" key={s.id} onClick={() => void choose(s.id)}>
              {s.label}
            </button>
          ))}
        </span>
      )}
    </>
  );
}
