import { useCallback, useEffect, useMemo, useState } from "react";
import type { Actor } from "../../server/domain/model";
import type { hubView } from "../../server/catalog/product-hub";
import { api } from "./api";
import { useOps } from "./ops-i18n";
import "./product-hub.css";

type View = Extract<ReturnType<typeof hubView>, { available: true }>;
type Unavailable = Extract<ReturnType<typeof hubView>, { available: false }>;
type Product = View["products"][number];
type Variant = Product["variants"][number];
type Asset = View["assets"][number];
type Locale = "en" | "es" | "ar";
type Content = {
  name: string | null;
  description: string | null;
  variantLabel: string | null;
};
type Translations = Record<Locale, Content>;
const LOCALES: Locale[] = ["en", "es", "ar"];
const LOCALE_NAME: Record<Locale, string> = {
  en: "English",
  es: "Español",
  ar: "العربية",
};
const blank = (): Translations => ({
  en: { name: null, description: null, variantLabel: null },
  es: { name: null, description: null, variantLabel: null },
  ar: { name: null, description: null, variantLabel: null },
});
const aed = (fils: number) =>
  `AED ${(fils / 100).toLocaleString("en-AE", { minimumFractionDigits: fils % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
/** "12.5" → 1250 fils. Integer fils only; anything else is not a price. */
export function parseAed(value: string): number | null {
  const match = /^(\d{1,6})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const fils = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return fils > 0 ? fils : null;
}
const thumb = (asset: Asset | undefined) => {
  if (!asset) return null;
  const sized = asset.derivatives.filter((d) => d.format !== "avif");
  const list = sized.length ? sized : asset.derivatives;
  return [...list].sort((a, b) => (a.width ?? 9999) - (b.width ?? 9999))[0]!
    .src;
};
const nullable = (value: string) => (value.trim() ? value : null);

type DraftVariant = Omit<
  Variant,
  "priceFils" | "retired" | "inSeason" | "existing" | "productId"
> & {
  price: string;
  retired: boolean;
  inSeason: boolean;
  existing: boolean;
};
type Draft = {
  isNew: boolean;
  existingPublished: boolean;
  id: string;
  slug: string;
  familyId: string;
  categoryId: string;
  name: string;
  description: string;
  commercialState: Product["commercialState"];
  translations: Translations;
  media: Product["media"];
  variants: DraftVariant[];
};
const toDraft = (p: Product): Draft => ({
  isNew: p.isNew,
  existingPublished: !p.isNew,
  id: p.id,
  slug: p.slug ?? "",
  familyId: p.familyId ?? "",
  categoryId: p.categoryId ?? "",
  name: p.name,
  description: p.description ?? "",
  commercialState: p.commercialState,
  translations: structuredClone(p.translations),
  media: structuredClone(p.media),
  variants: p.variants.map(({ priceFils, productId: _productId, ...v }) => ({
    ...v,
    price: (priceFils / 100).toFixed(2).replace(/\.00$/, ""),
  })),
});
const emptyDraft = (view: View): Draft => {
  const category = view.categories[0]!;
  const family = view.families.find((f) => f.categoryId === category.id);
  return {
    isNew: true,
    existingPublished: false,
    id: "",
    slug: "",
    familyId: family?.id ?? "",
    categoryId: category.id,
    name: "",
    description: "",
    commercialState: "draft",
    translations: blank(),
    media: [],
    variants: [newVariant()],
  };
};
const newVariant = (): DraftVariant => ({
  skuId: "",
  flavor: null,
  size: null,
  packQuantity: null,
  commercialState: "draft",
  translations: blank(),
  media: [],
  catalogName: "",
  price: "",
  active: false,
  availability: "available",
  retired: false,
  inSeason: true,
  existing: false,
});

export function ProductHub({ actor }: { actor: Actor }) {
  const { t, formatDate } = useOps();
  const [data, setData] = useState<View | Unavailable | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"catalog" | "review" | "activity">("catalog");
  const [editing, setEditing] = useState<Draft | null>(null);
  const restricted = !["admin", "manager"].includes(actor.role);
  const load = useCallback(async () => {
    try {
      setData(await api<View | Unavailable>("product-hub"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    if (!restricted) void load();
  }, [load, restricted]);
  /** Every write carries the version it was based on and a fresh idempotency key. */
  const send = async (command: Record<string, unknown>, done: string) => {
    if (!data?.available) return false;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(
        "product-hub/commands",
        { ...command, expectedVersion: data.version },
        crypto.randomUUID(),
      );
      await load();
      setNotice(done);
      return true;
    } catch (e) {
      setError((e as Error).message);
      await load();
      return false;
    } finally {
      setBusy(false);
    }
  };
  if (restricted)
    return (
      <section className="ops-panel" role="status">
        <h2>{t("Product Hub")}</h2>
        <p>{t("Product Hub access is restricted")}</p>
      </section>
    );
  if (!data)
    return (
      <section className="ops-panel" role="status">
        {error ? <p className="co-error">{error}</p> : t("Loading catalog…")}
      </section>
    );
  // Anything that is not an explicit, available catalog is shown as unavailable.
  if (data.available !== true)
    return (
      <section className="ops-panel ph-unavailable" role="status">
        <h2>{t("Product Hub")}</h2>
        <p>
          {t(
            (data as Partial<Unavailable>).reason ??
              "Product Hub is disabled in this environment",
          )}
        </p>
        <p>{t("The approved catalog remains unchanged.")}</p>
      </section>
    );
  const canEdit = data.permissions.canEdit;
  return (
    <div className="ph">
      <header className="ph-status ops-panel">
        <div>
          <p className="ph-eyebrow">{t("Published catalog")}</p>
          <p className="ph-revision">
            <code>{data.published.id.slice(11, 23)}</code>
            <span>
              {data.published.publishedAt
                ? formatDate(data.published.publishedAt)
                : t("Imported baseline")}
            </span>
          </p>
        </div>
        <div>
          <p className="ph-eyebrow">{t("Draft")}</p>
          <p className="ph-revision">
            {data.draft ? (
              <>
                <strong className="ph-chip ph-chip-draft">
                  {t("{{count}} unpublished changes", {
                    count: data.changes.length,
                  })}
                </strong>
                <span>
                  {data.draft.updatedBy} · {formatDate(data.draft.updatedAt)}
                </span>
              </>
            ) : (
              <span>{t("No unpublished changes")}</span>
            )}
          </p>
        </div>
        <div className="ph-status-actions">
          {canEdit && !editing && (
            <button
              className="primary"
              onClick={() => {
                setTab("catalog");
                setEditing(emptyDraft(data));
              }}
            >
              {t("New product")}
            </button>
          )}
        </div>
      </header>
      {!canEdit && (
        <p className="ph-banner" role="status">
          {t(
            "View only. Only an administrator can edit or publish the catalog.",
          )}
        </p>
      )}
      <p className="ph-banner ph-banner-info" role="note">
        {t(
          "Changes stay in a private draft until published. The public storefront still ships its catalog with each build, so publishing here does not yet change what customers see.",
        )}
      </p>
      {data.draft?.stale && (
        <p className="ph-banner ph-banner-error" role="alert">
          {t(
            "The published catalog changed after this draft was started. Discard the draft and re-apply your changes.",
          )}
        </p>
      )}
      {error && (
        <p className="co-error" role="alert">
          {t(error)}
        </p>
      )}
      {notice && (
        <p className="ph-banner ph-banner-ok" role="status">
          {t(notice)}
        </p>
      )}
      {editing ? (
        <Editor
          key={editing.id || "new"}
          view={data}
          initial={editing}
          canEdit={canEdit}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={async (command) => {
            if (await send(command, "Draft saved")) setEditing(null);
          }}
          reload={load}
          setError={setError}
        />
      ) : (
        <>
          <nav className="ph-tabs" aria-label={t("Product Hub sections")}>
            {(
              [
                ["catalog", t("Catalog")],
                [
                  "review",
                  `${t("Review & publish")}${data.changes.length ? ` (${data.changes.length})` : ""}`,
                ],
                ["activity", t("Activity")],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={tab === id}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          {tab === "catalog" && (
            <Overview view={data} onOpen={(p) => setEditing(toDraft(p))} />
          )}
          {tab === "review" && (
            <Review
              view={data}
              busy={busy}
              onPublish={() =>
                send(
                  {
                    type: "publish",
                    expectedPublishedRevision: data.published.id,
                  },
                  "Catalog published",
                )
              }
              onDiscard={() =>
                send({ type: "discardDraft" }, "Draft discarded")
              }
            />
          )}
          {tab === "activity" && (
            <section className="ops-panel">
              <h2>{t("Activity")}</h2>
              {data.history.length === 0 ? (
                <p>{t("No catalog activity yet")}</p>
              ) : (
                <ul className="ph-history">
                  {data.history.map((h) => (
                    <li key={`${h.version}-${h.at}`}>
                      <strong
                        className={`ph-chip ${h.action === "publish" ? "ph-chip-live" : ""}`}
                      >
                        {t(
                          h.action === "publish"
                            ? "Published"
                            : h.action === "draft.discard"
                              ? "Discarded"
                              : "Draft",
                        )}
                      </strong>
                      <span>{h.summary}</span>
                      <small>
                        {h.actor} · {formatDate(h.at)}
                      </small>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Chips({ p }: { p: Product }) {
  const { t } = useOps();
  const active = p.variants.filter((v) => v.active).length;
  return (
    <span className="ph-chips">
      <strong
        className={`ph-chip ${p.commercialState === "published" ? "ph-chip-live" : p.commercialState === "draft" ? "ph-chip-draft" : ""}`}
      >
        {t(
          p.commercialState === "published"
            ? "Published"
            : p.commercialState === "draft"
              ? "Unpublished"
              : "Archived",
        )}
      </strong>
      {active === 0 && <strong className="ph-chip">{t("Inactive")}</strong>}
      {p.variants.some((v) => v.active && v.availability === "unavailable") && (
        <strong className="ph-chip ph-chip-warn">{t("Unavailable")}</strong>
      )}
      {p.isNew && <strong className="ph-chip ph-chip-draft">{t("New")}</strong>}
      {p.changed && !p.isNew && (
        <strong className="ph-chip ph-chip-draft">{t("Edited")}</strong>
      )}
    </span>
  );
}

function Overview({
  view,
  onOpen,
}: {
  view: View;
  onOpen: (p: Product) => void;
}) {
  const { t } = useOps();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [availability, setAvailability] = useState("");
  const [changedOnly, setChangedOnly] = useState(false);
  const assets = useMemo(
    () => new Map(view.assets.map((a) => [a.id, a])),
    [view.assets],
  );
  const families = useMemo(
    () => new Map(view.families.map((f) => [f.id, f])),
    [view.families],
  );
  const categories = useMemo(
    () => new Map(view.categories.map((c) => [c.id, c])),
    [view.categories],
  );
  const needle = query.trim().toLowerCase();
  const rows = view.products.filter((p) => {
    const active = p.variants.some((v) => v.active);
    return (
      (!category || p.categoryId === category) &&
      (!status || p.commercialState === status) &&
      (!changedOnly || p.changed || p.isNew) &&
      (!availability ||
        (availability === "active" && active) ||
        (availability === "inactive" && !active) ||
        (availability === "unavailable" &&
          p.variants.some((v) => v.availability === "unavailable"))) &&
      (!needle ||
        [p.name, p.id, p.slug ?? "", ...p.variants.map((v) => v.skuId)].some(
          (s) => s.toLowerCase().includes(needle),
        ))
    );
  });
  const skus = view.products.flatMap((p) => p.variants);
  return (
    <section className="ops-panel ph-overview">
      <dl className="ph-metrics">
        <div>
          <dt>{t("Products")}</dt>
          <dd>
            {
              view.products.filter((p) => p.commercialState !== "archived")
                .length
            }
          </dd>
        </div>
        <div>
          <dt>{t("Published")}</dt>
          <dd>
            {
              view.products.filter((p) => p.commercialState === "published")
                .length
            }
          </dd>
        </div>
        <div>
          <dt>{t("SKUs")}</dt>
          <dd>{skus.length}</dd>
        </div>
        <div>
          <dt>{t("Active SKUs")}</dt>
          <dd>{skus.filter((v) => v.active).length}</dd>
        </div>
        <div>
          <dt>{t("Categories")}</dt>
          <dd>{view.categories.length}</dd>
        </div>
        <div>
          <dt>{t("Families")}</dt>
          <dd>{view.families.length}</dd>
        </div>
      </dl>
      <div className="ph-filters">
        <label>
          {t("Search")}
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Name, product ID or SKU")}
          />
        </label>
        <label>
          {t("Category")}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">{t("All categories")}</option>
            {view.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Status")}
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t("Any status")}</option>
            <option value="published">{t("Published")}</option>
            <option value="draft">{t("Unpublished")}</option>
            <option value="archived">{t("Archived")}</option>
          </select>
        </label>
        <label>
          {t("Availability")}
          <select
            value={availability}
            onChange={(e) => setAvailability(e.target.value)}
          >
            <option value="">{t("Any availability")}</option>
            <option value="active">{t("Has active SKUs")}</option>
            <option value="inactive">{t("Inactive")}</option>
            <option value="unavailable">{t("Unavailable")}</option>
          </select>
        </label>
        <label className="ph-check">
          <input
            type="checkbox"
            checked={changedOnly}
            onChange={(e) => setChangedOnly(e.target.checked)}
          />
          {t("Draft changes only")}
        </label>
      </div>
      <p className="ph-count" role="status">
        {t("{{count}} products", { count: rows.length })}
      </p>
      <ul className="ph-list">
        {rows.map((p) => {
          const prices = p.variants.map((v) => v.priceFils);
          const image = thumb(
            assets.get(
              p.media.find((m) => m.role === "primary")?.assetId ?? "",
            ),
          );
          return (
            <li key={p.id}>
              <button
                type="button"
                className="ph-row"
                onClick={() => onOpen(p)}
              >
                <span className="ph-thumb" aria-hidden="true">
                  {image ? <img src={image} alt="" loading="lazy" /> : null}
                </span>
                <span className="ph-row-main">
                  <strong>{p.name}</strong>
                  <small>
                    {categories.get(p.categoryId ?? "")?.name ??
                      t("No category")}{" "}
                    · {families.get(p.familyId ?? "")?.name ?? t("No family")}
                  </small>
                </span>
                <span className="ph-row-meta">
                  <span>
                    {t("{{active}} of {{total}} SKUs active", {
                      active: p.variants.filter((v) => v.active).length,
                      total: p.variants.length,
                    })}
                  </span>
                  <span>
                    {prices.length
                      ? Math.min(...prices) === Math.max(...prices)
                        ? aed(prices[0]!)
                        : `${aed(Math.min(...prices))} – ${aed(Math.max(...prices))}`
                      : "—"}
                  </span>
                </span>
                <Chips p={p} />
              </button>
            </li>
          );
        })}
      </ul>
      {rows.length === 0 && <p>{t("No products match these filters")}</p>}
    </section>
  );
}

function Review({
  view,
  busy,
  onPublish,
  onDiscard,
}: {
  view: View;
  busy: boolean;
  onPublish: () => void;
  onDiscard: () => void;
}) {
  const { t } = useOps();
  const [confirmed, setConfirmed] = useState(false);
  const errors = view.issues.filter((i) => i.level === "error");
  const warnings = view.issues.filter((i) => i.level === "warning");
  const blocked =
    !view.permissions.canPublish ||
    errors.length > 0 ||
    !view.changes.length ||
    !!view.draft?.stale;
  return (
    <section className="ops-panel ph-review">
      <h2>{t("Review & publish")}</h2>
      {!view.draft ? (
        <p>{t("No unpublished changes")}</p>
      ) : (
        <>
          <h3>{t("Checks")}</h3>
          {view.issues.length === 0 ? (
            <p className="ph-banner ph-banner-ok">{t("No problems found")}</p>
          ) : (
            <ul className="ph-issues">
              {[...errors, ...warnings].map((i, n) => (
                <li
                  key={n}
                  className={
                    i.level === "error" ? "ph-issue-error" : "ph-issue-warn"
                  }
                >
                  <strong>
                    {t(i.level === "error" ? "Must fix" : "Review")}
                  </strong>
                  <span>{i.message}</span>
                  <code>{i.target}</code>
                </li>
              ))}
            </ul>
          )}
          <h3>{t("Before and after")}</h3>
          <div className="ops-table-scroll">
            <table className="ph-diff">
              <thead>
                <tr>
                  <th>{t("Item")}</th>
                  <th>{t("Field")}</th>
                  <th>{t("Published now")}</th>
                  <th>{t("After publishing")}</th>
                </tr>
              </thead>
              <tbody>
                {view.changes.map((c, n) => (
                  <tr
                    key={n}
                    className={c.kind === "price" ? "ph-diff-price" : ""}
                  >
                    <td>
                      <code>{c.target}</code>
                    </td>
                    <td>
                      {c.field
                        .split(" · ")
                        .map((part, i) => (i ? part : t(part)))
                        .join(" · ")}
                    </td>
                    <td>{c.before ?? "—"}</td>
                    <td>{c.after ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {view.permissions.canEdit && (
            <div className="ph-publish">
              {view.flags.publishBlocked && (
                <p className="ph-banner" role="status">
                  {t(view.flags.publishBlocked)}
                </p>
              )}
              <label className="ph-check">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={blocked}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                {t(
                  "I reviewed every change above and want it to become the published catalog",
                )}
              </label>
              <div className="ph-actions">
                <button
                  className="primary"
                  disabled={busy || blocked || !confirmed}
                  onClick={onPublish}
                >
                  {t("Publish catalog")}
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(t("Discard every unpublished change?")))
                      onDiscard();
                  }}
                >
                  {t("Discard draft")}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Editor({
  view,
  initial,
  canEdit,
  busy,
  onClose,
  onSave,
  reload,
  setError,
}: {
  view: View;
  initial: Draft;
  canEdit: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: (command: Record<string, unknown>) => Promise<void>;
  reload: () => Promise<void>;
  setError: (message: string) => void;
}) {
  const { t } = useOps();
  const [d, setD] = useState<Draft>(initial);
  const [locale, setLocale] = useState<Locale>("en");
  const [problems, setProblems] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [pick, setPick] = useState("");
  const assets = useMemo(
    () => new Map(view.assets.map((a) => [a.id, a])),
    [view.assets],
  );
  const family = view.families.find((f) => f.id === d.familyId);
  const families = view.families.filter((f) => f.categoryId === d.categoryId);
  const archival = !initial.isNew && (!initial.familyId || !initial.categoryId);
  const locked = !canEdit || archival;
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const setVariant = (index: number, patch: Partial<DraftVariant>) =>
    setD((x) => ({
      ...x,
      variants: x.variants.map((v, i) =>
        i === index ? { ...v, ...patch } : v,
      ),
    }));
  const setContent = (field: "name" | "description", value: string) =>
    setD((x) => ({
      ...x,
      translations: {
        ...x.translations,
        [locale]: { ...x.translations[locale], [field]: nullable(value) },
      },
    }));
  const validate = () => {
    const list: string[] = [];
    const idShape = /^[A-Za-z0-9][A-Za-z0-9_-]{0,149}$/;
    if (!idShape.test(d.id))
      list.push(
        t("Product ID: letters, numbers, hyphens and underscores only"),
      );
    if (d.slug && !idShape.test(d.slug))
      list.push(t("Slug: letters, numbers, hyphens and underscores only"));
    if (!d.name.trim()) list.push(t("Name is required"));
    if (!d.familyId) list.push(t("Choose a family"));
    if (d.commercialState === "published" && !d.slug)
      list.push(t("A published product needs a slug"));
    if (!d.variants.length) list.push(t("Add at least one variant"));
    const seen = new Set<string>();
    d.variants.forEach((v, i) => {
      const label = v.skuId || `#${i + 1}`;
      if (!idShape.test(v.skuId))
        list.push(
          `${label}: ${t("SKU: letters, numbers, hyphens and underscores only")}`,
        );
      if (seen.has(v.skuId.toLowerCase()))
        list.push(`${label}: ${t("Duplicate SKU")}`);
      seen.add(v.skuId.toLowerCase());
      if (parseAed(v.price) === null)
        list.push(
          `${label}: ${t("Price must be a positive amount in AED, up to two decimals")}`,
        );
      if (!v.catalogName.trim())
        list.push(`${label}: ${t("Catalog name is required")}`);
      if (family?.pack && !v.packQuantity)
        list.push(`${label}: ${t("Pack products need a pack quantity")}`);
      if (
        v.commercialState === "published" &&
        d.commercialState !== "published"
      )
        list.push(
          `${label}: ${t("A draft product cannot have published variants")}`,
        );
    });
    return list;
  };
  const save = async () => {
    const list = validate();
    setProblems(list);
    if (list.length) return;
    await onSave({
      type: "saveProduct",
      product: {
        id: d.id,
        slug: d.slug || null,
        familyId: d.familyId,
        categoryId: d.categoryId,
        name: d.name.trim(),
        description: nullable(d.description),
        commercialState: d.commercialState,
        translations: d.translations,
        media: d.media,
      },
      variants: d.variants.map((v) => ({
        skuId: v.skuId,
        flavor: v.flavor,
        size: v.size,
        packQuantity: v.packQuantity,
        commercialState: v.commercialState,
        translations: v.translations,
        media: v.media,
        catalogName: v.catalogName.trim(),
        priceFils: parseAed(v.price)!,
        active: v.active,
        availability: v.availability,
      })),
    });
  };
  const upload = async (file: File) => {
    setUploading(true);
    setError("");
    try {
      const alt = blank();
      alt.en.name = nullable(d.name);
      const res = await fetch("/api/product-hub/media", {
        method: "POST",
        headers: {
          "Content-Type": file.type,
          "Idempotency-Key": crypto.randomUUID(),
          "X-Hub-Meta": btoa(
            JSON.stringify({ expectedVersion: view.version, alt }),
          )
            .replaceAll("+", "-")
            .replaceAll("/", "_")
            .replace(/=+$/, ""),
        },
        body: file,
      });
      const body = (await res.json()) as {
        assetId?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok || !body.assetId)
        throw new Error(body.message ?? body.error ?? "Upload failed");
      await reload();
      setD((x) => ({
        ...x,
        media: [
          ...x.media,
          {
            assetId: body.assetId!,
            role: x.media.some((m) => m.role === "primary")
              ? "gallery"
              : "primary",
            order: Math.max(-1, ...x.media.map((m) => m.order)) + 1,
          },
        ],
      }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };
  const content = d.translations[locale];
  const prices = d.variants
    .map((v) => parseAed(v.price))
    .filter((x): x is number => x !== null);
  const primary = thumb(
    assets.get(
      d.media.find((m) => m.role === "primary")?.assetId ??
        d.media[0]?.assetId ??
        "",
    ),
  );
  return (
    <section className="ph-editor">
      <div className="ph-editor-head">
        <button type="button" onClick={onClose}>
          ← {t("Back to catalog")}
        </button>
        <h2>
          {initial.isNew && !initial.id ? t("New product") : d.name || d.id}
        </h2>
        {canEdit && !archival && (
          <button
            className="primary"
            disabled={busy || uploading}
            onClick={() => void save()}
          >
            {t("Save draft")}
          </button>
        )}
      </div>
      {archival && (
        <p className="ph-banner" role="status">
          {t(
            "Archived technical record. It keeps retired SKUs for order history and cannot be edited or sold.",
          )}
        </p>
      )}
      {problems.length > 0 && (
        <ul className="ph-issues" role="alert">
          {problems.map((p) => (
            <li key={p} className="ph-issue-error">
              <strong>{t("Must fix")}</strong>
              <span>{p}</span>
            </li>
          ))}
        </ul>
      )}
      <fieldset className="ph-fieldset" disabled={locked || busy}>
        <div className="ph-editor-grid">
          <div className="ph-editor-main">
            <section className="ops-panel">
              <h3>{t("Product")}</h3>
              <div className="ph-form">
                <label>
                  {t("Name")}
                  <input
                    value={d.name}
                    maxLength={300}
                    onChange={(e) => set({ name: e.target.value })}
                  />
                </label>
                <label>
                  {t("Product ID")}
                  <input
                    value={d.id}
                    disabled={!initial.isNew || !!initial.id}
                    onChange={(e) =>
                      set({
                        id: e.target.value,
                        slug: d.slug === d.id ? e.target.value : d.slug,
                      })
                    }
                  />
                  <small>
                    {t(
                      "Permanent. It cannot change after the product is saved.",
                    )}
                  </small>
                </label>
                <label>
                  {t("Slug")}
                  <input
                    value={d.slug}
                    disabled={initial.existingPublished && !!initial.slug}
                    onChange={(e) => set({ slug: e.target.value })}
                  />
                  <small>
                    {t("Used in the product link. Fixed once published.")}
                  </small>
                </label>
                <label>
                  {t("Category")}
                  <select
                    value={d.categoryId}
                    disabled={initial.existingPublished}
                    onChange={(e) =>
                      set({
                        categoryId: e.target.value,
                        familyId:
                          view.families.find(
                            (f) => f.categoryId === e.target.value,
                          )?.id ?? "",
                      })
                    }
                  >
                    {view.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("Family")}
                  <select
                    value={d.familyId}
                    onChange={(e) => set({ familyId: e.target.value })}
                  >
                    <option value="">{t("Choose a family")}</option>
                    {families.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                        {f.pack ? ` · ${t("Pack")}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("Publication status")}
                  <select
                    value={d.commercialState}
                    onChange={(e) =>
                      set({
                        commercialState: e.target
                          .value as Draft["commercialState"],
                      })
                    }
                  >
                    <option value="draft">{t("Unpublished")}</option>
                    <option value="published">{t("Published")}</option>
                    <option value="archived">{t("Archived")}</option>
                  </select>
                  <small>
                    {t(
                      "Unpublished products are hidden. Inactive SKUs cannot be sold. Unavailable SKUs are temporarily out.",
                    )}
                  </small>
                </label>
                <label className="ph-wide">
                  {t("Internal description")}
                  <textarea
                    value={d.description}
                    maxLength={2000}
                    rows={2}
                    onChange={(e) => set({ description: e.target.value })}
                  />
                </label>
              </div>
            </section>
            <section className="ops-panel">
              <h3>{t("Customer content")}</h3>
              <div
                className="ph-tabs ph-tabs-small"
                role="tablist"
                aria-label={t("Content language")}
              >
                {LOCALES.map((l) => (
                  <button
                    key={l}
                    type="button"
                    role="tab"
                    aria-selected={locale === l}
                    onClick={() => setLocale(l)}
                  >
                    {LOCALE_NAME[l]}
                    {!d.translations[l].name && (
                      <span className="ph-dot" aria-label={t("Missing")} />
                    )}
                  </button>
                ))}
              </div>
              <div
                className="ph-form"
                dir={locale === "ar" ? "rtl" : "ltr"}
                lang={locale}
              >
                <label className="ph-wide">
                  {t("Name shown to customers")}
                  <input
                    value={content.name ?? ""}
                    maxLength={2000}
                    onChange={(e) => setContent("name", e.target.value)}
                  />
                </label>
                <label className="ph-wide">
                  {t("Description shown to customers")}
                  <textarea
                    value={content.description ?? ""}
                    maxLength={2000}
                    rows={3}
                    onChange={(e) => setContent("description", e.target.value)}
                  />
                </label>
              </div>
            </section>
            <section className="ops-panel">
              <h3>{t("Variants and prices")}</h3>
              <ul className="ph-variants">
                {d.variants.map((v, i) => (
                  <li key={i} className={v.retired ? "ph-variant-retired" : ""}>
                    <div className="ph-form">
                      <label>
                        {t("SKU")}
                        <input
                          value={v.skuId}
                          disabled={v.existing}
                          onChange={(e) =>
                            setVariant(i, { skuId: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        {t("Catalog name")}
                        <input
                          value={v.catalogName}
                          maxLength={300}
                          onChange={(e) =>
                            setVariant(i, { catalogName: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        {t("Flavour")}
                        <input
                          value={v.flavor ?? ""}
                          onChange={(e) =>
                            setVariant(i, { flavor: nullable(e.target.value) })
                          }
                        />
                      </label>
                      <label>
                        {t("Size")}
                        <input
                          value={v.size ?? ""}
                          onChange={(e) =>
                            setVariant(i, { size: nullable(e.target.value) })
                          }
                        />
                      </label>
                      {family?.pack && (
                        <label>
                          {t("Pack quantity")}
                          <input
                            inputMode="numeric"
                            value={v.packQuantity ?? ""}
                            onChange={(e) =>
                              setVariant(i, {
                                packQuantity:
                                  /^\d{1,4}$/.test(e.target.value) &&
                                  Number(e.target.value) > 0
                                    ? Number(e.target.value)
                                    : null,
                              })
                            }
                          />
                        </label>
                      )}
                      <label>
                        {t("Price (AED)")}
                        <input
                          inputMode="decimal"
                          value={v.price}
                          aria-invalid={
                            v.price !== "" && parseAed(v.price) === null
                          }
                          onChange={(e) =>
                            setVariant(i, { price: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        {t("Availability")}
                        <select
                          value={v.availability}
                          onChange={(e) =>
                            setVariant(i, {
                              availability: e.target
                                .value as DraftVariant["availability"],
                            })
                          }
                        >
                          <option value="available">{t("Available")}</option>
                          <option value="unavailable">
                            {t("Unavailable")}
                          </option>
                        </select>
                      </label>
                      <label>
                        {t("Publication status")}
                        <select
                          value={v.commercialState}
                          disabled={v.retired}
                          onChange={(e) =>
                            setVariant(i, {
                              commercialState: e.target
                                .value as DraftVariant["commercialState"],
                            })
                          }
                        >
                          <option value="draft">{t("Unpublished")}</option>
                          <option value="published">{t("Published")}</option>
                          <option value="archived">{t("Archived")}</option>
                        </select>
                      </label>
                      <label className="ph-check">
                        <input
                          type="checkbox"
                          checked={v.active}
                          disabled={v.retired}
                          onChange={(e) =>
                            setVariant(i, { active: e.target.checked })
                          }
                        />
                        {t("Active (can be sold)")}
                      </label>
                    </div>
                    <p className="ph-chips">
                      {v.existing ? (
                        <strong className="ph-chip">{t("Existing SKU")}</strong>
                      ) : (
                        <strong className="ph-chip ph-chip-draft">
                          {t("New SKU")}
                        </strong>
                      )}
                      {v.retired && (
                        <strong className="ph-chip ph-chip-warn">
                          {t("Removed from the approved menu")}
                        </strong>
                      )}
                      {!v.inSeason && (
                        <strong className="ph-chip ph-chip-warn">
                          {t("Out of season today")}
                        </strong>
                      )}
                      {!v.existing && canEdit && (
                        <button
                          type="button"
                          className="ph-link"
                          onClick={() =>
                            setD((x) => ({
                              ...x,
                              variants: x.variants.filter((_, n) => n !== i),
                            }))
                          }
                        >
                          {t("Remove")}
                        </button>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
              {canEdit && !archival && (
                <button
                  type="button"
                  onClick={() =>
                    setD((x) => ({
                      ...x,
                      variants: [...x.variants, newVariant()],
                    }))
                  }
                >
                  {t("Add variant")}
                </button>
              )}
              <p>
                <small>
                  {t(
                    "Existing SKUs are permanent: they can be deactivated but never deleted or renamed.",
                  )}
                </small>
              </p>
            </section>
            <section className="ops-panel">
              <h3>{t("Images")}</h3>
              <ul className="ph-media">
                {[...d.media]
                  .sort((a, b) =>
                    a.role === b.role
                      ? a.order - b.order
                      : a.role === "primary"
                        ? -1
                        : 1,
                  )
                  .map((m) => {
                    const asset = assets.get(m.assetId);
                    const src = thumb(asset);
                    return (
                      <li key={m.assetId}>
                        <span className="ph-thumb ph-thumb-large">
                          {src ? (
                            <img src={src} alt={asset?.alt.en.name ?? ""} />
                          ) : null}
                        </span>
                        <span className="ph-media-meta">
                          <strong
                            className={`ph-chip ${m.role === "primary" ? "ph-chip-live" : ""}`}
                          >
                            {t(
                              m.role === "primary"
                                ? "Primary image"
                                : "Gallery image",
                            )}
                          </strong>
                          <small>
                            {asset?.alt[locale].name ??
                              t("No description for this language")}
                          </small>
                          <code>{asset?.version.slice(0, 10)}</code>
                        </span>
                        {canEdit && !archival && (
                          <span className="ph-actions">
                            {m.role !== "primary" && (
                              <button
                                type="button"
                                onClick={() =>
                                  setD((x) => ({
                                    ...x,
                                    media: x.media.map((y, n) => ({
                                      ...y,
                                      role:
                                        y.assetId === m.assetId
                                          ? ("primary" as const)
                                          : ("gallery" as const),
                                      order:
                                        y.assetId === m.assetId ? 0 : n + 1,
                                    })),
                                  }))
                                }
                              >
                                {t("Make primary")}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setD((x) => ({
                                  ...x,
                                  media: x.media.filter(
                                    (y) => y.assetId !== m.assetId,
                                  ),
                                }))
                              }
                            >
                              {t("Remove")}
                            </button>
                          </span>
                        )}
                      </li>
                    );
                  })}
              </ul>
              {d.media.length === 0 && <p>{t("No images selected")}</p>}
              {canEdit && !archival && (
                <div className="ph-form">
                  <label>
                    {t("Choose from the image library")}
                    <select
                      value={pick}
                      onChange={(e) => {
                        const idValue = e.target.value;
                        setPick("");
                        if (
                          !idValue ||
                          d.media.some((m) => m.assetId === idValue)
                        )
                          return;
                        setD((x) => ({
                          ...x,
                          media: [
                            ...x.media,
                            {
                              assetId: idValue,
                              role: x.media.some((m) => m.role === "primary")
                                ? "gallery"
                                : "primary",
                              order:
                                Math.max(-1, ...x.media.map((m) => m.order)) +
                                1,
                            },
                          ],
                        }));
                      }}
                    >
                      <option value="">{t("Select an image")}</option>
                      {view.assets.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.alt.en.name ?? a.id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("Upload a new image")}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/avif"
                      disabled={uploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void upload(file);
                      }}
                    />
                    <small>
                      {t(
                        "PNG, JPEG, WebP or AVIF. Up to 3 MB, 200–6000 px per side.",
                      )}
                    </small>
                  </label>
                </div>
              )}
            </section>
          </div>
          <aside className="ph-preview ops-panel" aria-label={t("Preview")}>
            <h3>{t("Preview")}</h3>
            <div
              className="ph-card"
              dir={locale === "ar" ? "rtl" : "ltr"}
              lang={locale}
            >
              <span className="ph-card-image">
                {primary ? (
                  <img src={primary} alt="" />
                ) : (
                  <em>{t("No image")}</em>
                )}
              </span>
              <strong>{content.name ?? d.name ?? "—"}</strong>
              {content.description && <p>{content.description}</p>}
              <p className="ph-card-price">
                {prices.length
                  ? Math.min(...prices) === Math.max(...prices)
                    ? aed(prices[0]!)
                    : `${t("From")} ${aed(Math.min(...prices))}`
                  : "—"}
              </p>
              <ul>
                {d.variants
                  .filter((v) => v.active && v.commercialState === "published")
                  .map((v, i) => (
                    <li key={i}>
                      {[v.flavor, v.size].filter(Boolean).join(" · ") ||
                        v.skuId}
                      {v.availability === "unavailable"
                        ? ` · ${t("Unavailable")}`
                        : ""}
                    </li>
                  ))}
              </ul>
            </div>
            <p>
              <small>
                {t(
                  d.commercialState === "published"
                    ? "Customers would see the published, active variants listed above."
                    : "This product is not published, so customers would not see it.",
                )}
              </small>
            </p>
          </aside>
        </div>
      </fieldset>
    </section>
  );
}
