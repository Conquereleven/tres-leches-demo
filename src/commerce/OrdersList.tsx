import { useState } from "react";
import {
  CaretLeft,
  CaretRight,
  Funnel,
  MagnifyingGlass,
  Receipt,
  Storefront,
  Truck,
  X,
} from "@phosphor-icons/react";
import type { Order } from "../../server/domain/model";
import { orderReference } from "../../shared/order-number";
import type { Workspace as Data } from "./api";
import { FulfilmentBadge, PaymentBadge } from "./OrderBadges";
import { useOps } from "./ops-i18n";
import {
  EMPTY_QUERY,
  FULFILMENT_FILTERS,
  PAGE_SIZE,
  PAYMENT_FILTERS,
  activeFilterCount,
  conversationOf,
  createdAt,
  customerName,
  dueDate,
  dueSlot,
  fulfilmentGroup,
  itemCount,
  listOrders,
  orderPath,
  paymentOf,
  type ListQuery,
} from "./order-view";

export const aed = (fils: number | null | undefined) =>
  fils == null ? null : `AED ${(fils / 100).toFixed(2)}`;

/**
 * Every order in the workspace, searchable and filterable. Unpaid orders are
 * listed and marked, but only the Kitchen queue decides what is produced.
 */
export function OrdersList({
  data,
  query,
  onQuery,
  onOpen,
}: {
  data: Data;
  query: ListQuery;
  onQuery: (next: ListQuery) => void;
  onOpen: (id: string) => void;
}) {
  const { t } = useOps();
  const filters = activeFilterCount(query);
  const [open, setOpen] = useState(
    () =>
      !!(
        query.placedFrom ||
        query.placedTo ||
        query.dueFrom ||
        query.dueTo ||
        query.payment !== "any" ||
        query.method !== "any"
      ),
  );
  const set = (patch: Partial<ListQuery>) =>
    onQuery({ ...query, page: 1, ...patch });
  const result = listOrders(data, query);
  const first = result.total ? (result.page - 1) * PAGE_SIZE + 1 : 0;
  const last = Math.min(result.page * PAGE_SIZE, result.total);
  const counts = new Map<string, number>();
  for (const o of data.orders) {
    const g = fulfilmentGroup(o.state);
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  return (
    <div className="oms oms-list">
      <div className="oms-card oms-toolbar">
        <div
          className="oms-tabs"
          role="group"
          aria-label={t("Filter by fulfillment status")}
        >
          {FULFILMENT_FILTERS.filter(
            ([id]) => id === "any" || counts.get(id) || query.fulfilment === id,
          ).map(([id, label]) => (
            <button
              type="button"
              key={id}
              aria-pressed={query.fulfilment === id}
              onClick={() => set({ fulfilment: id })}
            >
              {t(id === "any" ? "All" : label)}
              <span>
                {id === "any" ? data.orders.length : (counts.get(id) ?? 0)}
              </span>
            </button>
          ))}
        </div>
        <div className="oms-search-row">
          <label className="oms-search">
            <span className="oms-sr">{t("Search orders")}</span>
            <MagnifyingGlass aria-hidden />
            <input
              type="search"
              value={query.q}
              onChange={(e) => set({ q: e.target.value })}
              placeholder={t("Order number, customer, phone or email")}
            />
          </label>
          <button
            type="button"
            className="oms-button"
            aria-expanded={open}
            aria-controls="oms-filters"
            onClick={() => setOpen(!open)}
          >
            <Funnel aria-hidden />
            {t("Filters")}
            {filters > 0 && <span className="oms-count">{filters}</span>}
          </button>
        </div>
        {open && (
          <div className="oms-filters" id="oms-filters">
            <label>
              {t("Payment status")}
              <select
                value={query.payment}
                onChange={(e) =>
                  set({ payment: e.target.value as ListQuery["payment"] })
                }
              >
                {PAYMENT_FILTERS.map(([id, label]) => (
                  <option key={id} value={id}>
                    {t(label)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("Fulfillment method")}
              <select
                value={query.method}
                onChange={(e) =>
                  set({ method: e.target.value as ListQuery["method"] })
                }
              >
                <option value="any">{t("Delivery and pickup")}</option>
                <option value="delivery">{t("Entrega")}</option>
                <option value="pickup">{t("Pickup")}</option>
              </select>
            </label>
            <fieldset>
              <legend>{t("Order date")}</legend>
              <label>
                <span className="oms-sr">{t("Order date from")}</span>
                <input
                  type="date"
                  value={query.placedFrom}
                  max={query.placedTo || undefined}
                  onChange={(e) => set({ placedFrom: e.target.value })}
                />
              </label>
              <span aria-hidden>–</span>
              <label>
                <span className="oms-sr">{t("Order date to")}</span>
                <input
                  type="date"
                  value={query.placedTo}
                  min={query.placedFrom || undefined}
                  onChange={(e) => set({ placedTo: e.target.value })}
                />
              </label>
            </fieldset>
            <fieldset>
              <legend>{t("Delivery or pickup date")}</legend>
              <label>
                <span className="oms-sr">{t("Delivery date from")}</span>
                <input
                  type="date"
                  value={query.dueFrom}
                  max={query.dueTo || undefined}
                  onChange={(e) => set({ dueFrom: e.target.value })}
                />
              </label>
              <span aria-hidden>–</span>
              <label>
                <span className="oms-sr">{t("Delivery date to")}</span>
                <input
                  type="date"
                  value={query.dueTo}
                  min={query.dueFrom || undefined}
                  onChange={(e) => set({ dueTo: e.target.value })}
                />
              </label>
            </fieldset>
          </div>
        )}
        <div className="oms-toolbar-foot">
          <p className="oms-muted" aria-live="polite">
            {result.total === data.orders.length
              ? t("{{count}} orders", { count: result.total })
              : t("{{shown}} of {{count}} orders", {
                  shown: result.total,
                  count: data.orders.length,
                })}
          </p>
          {(filters > 0 || query.q) && (
            <button
              type="button"
              className="oms-link"
              onClick={() => onQuery(EMPTY_QUERY)}
            >
              <X aria-hidden />
              {t("Clear search and filters")}
            </button>
          )}
        </div>
      </div>

      {result.rows.length ? (
        <div className="oms-card oms-table-card">
          <table className="oms-table">
            <caption className="oms-sr">{t("Orders")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("Order")}</th>
                <th scope="col">{t("Cliente")}</th>
                <th scope="col">{t("Date")}</th>
                <th scope="col" className="oms-num">
                  {t("Items")}
                </th>
                <th scope="col" className="oms-num">
                  {t("Total")}
                </th>
                <th scope="col">{t("Payment")}</th>
                <th scope="col">{t("Fulfillment")}</th>
                <th scope="col">{t("Delivery")}</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((o) => (
                <OrderRow key={o.id} order={o} data={data} onOpen={onOpen} />
              ))}
            </tbody>
          </table>
          <nav className="oms-pagination" aria-label={t("Orders pages")}>
            <p className="oms-muted">
              {t("Showing {{first}}–{{last}} of {{count}}", {
                first,
                last,
                count: result.total,
              })}
            </p>
            {result.pages > 1 && (
              <div>
                <button
                  type="button"
                  className="oms-button"
                  disabled={result.page <= 1}
                  onClick={() => onQuery({ ...query, page: result.page - 1 })}
                >
                  <CaretLeft aria-hidden />
                  {t("Previous")}
                </button>
                <span>
                  {t("Page {{page}} of {{pages}}", {
                    page: result.page,
                    pages: result.pages,
                  })}
                </span>
                <button
                  type="button"
                  className="oms-button"
                  disabled={result.page >= result.pages}
                  onClick={() => onQuery({ ...query, page: result.page + 1 })}
                >
                  {t("Next")}
                  <CaretRight aria-hidden />
                </button>
              </div>
            )}
          </nav>
        </div>
      ) : (
        <div className="oms-card oms-empty">
          <Receipt size={30} aria-hidden />
          <h3>
            {data.orders.length
              ? t("No orders match these filters")
              : t("No orders yet")}
          </h3>
          <p className="oms-muted">
            {data.orders.length
              ? t("Change or clear the search and filters to see other orders.")
              : t("Orders appear here as soon as they are created.")}
          </p>
          {data.orders.length > 0 && (
            <button
              type="button"
              className="oms-button"
              onClick={() => onQuery(EMPTY_QUERY)}
            >
              {t("Clear search and filters")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function OrderRow({
  order: o,
  data,
  onOpen,
}: {
  order: Order;
  data: Data;
  onOpen: (id: string) => void;
}) {
  const { t, formatDate } = useOps();
  const c = conversationOf(data, o);
  const who = customerName(data, o, c);
  const placed = createdAt(o);
  const due = dueDate(o);
  const slot = dueSlot(o);
  const pickup = o.fulfillmentMethod === "pickup";
  const unpaid = fulfilmentGroup(o.state) === "unpaid";
  const total = aed(o.quote?.totalFils);
  return (
    <tr
      data-order={o.id}
      data-unpaid={unpaid || undefined}
      onClick={(e) => {
        // Let real links, modified clicks and text selection behave natively.
        if (
          e.defaultPrevented ||
          (e.target as HTMLElement).closest("a,button") ||
          window.getSelection()?.toString()
        )
          return;
        onOpen(o.id);
      }}
    >
      <th scope="row" data-label={t("Order")}>
        <a
          className="oms-order-link"
          href={orderPath(o.id)}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            onOpen(o.id);
          }}
        >
          {orderReference(o)}
        </a>
        {unpaid && (
          <small className="oms-muted">{t("Not in the kitchen queue")}</small>
        )}
      </th>
      <td data-label={t("Cliente")}>
        {who.name ?? (
          <span className="oms-muted">{t("Name not recorded")}</span>
        )}
      </td>
      <td data-label={t("Date")}>
        {placed ? (
          formatDate(placed)
        ) : (
          <span className="oms-muted">{t("Not stored")}</span>
        )}
      </td>
      <td data-label={t("Items")} className="oms-num">
        {itemCount(o)}
      </td>
      <td data-label={t("Total")} className="oms-num">
        {total ?? <span className="oms-muted">{t("Por confirmar")}</span>}
      </td>
      <td data-label={t("Payment")}>
        <PaymentBadge payment={paymentOf(data, o)} />
      </td>
      <td data-label={t("Fulfillment")}>
        <FulfilmentBadge order={o} />
      </td>
      <td data-label={t("Delivery")}>
        <span className="oms-where">
          {pickup ? <Storefront aria-hidden /> : <Truck aria-hidden />}
          {pickup
            ? t("Pickup")
            : (o.quote?.zoneName ?? (
                <span className="oms-muted">{t("Ubicación pendiente")}</span>
              ))}
        </span>
        <small className="oms-muted">
          {due ? formatDate(due, false) : t("Sin fecha")}
          {slot ? ` · ${slot}` : ""}
        </small>
      </td>
    </tr>
  );
}
