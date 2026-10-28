import { lineKey, preparationText } from "../../shared/pack-composition";
import { operationalProductName } from "./product-names";
import { OperationalProductName } from "./OperationalProductName";
import { ticketSnapshot } from "./ticket-snapshot";
import { useState } from "react";
import { Printer } from "@phosphor-icons/react";
import type { Workspace } from "./api";
import { PRINTER_TARGETS, type PrinterDestination } from "./print-contract";
import { useOps, translateOps, formatOpsDate } from "./ops-i18n";
import { orderReference } from "../../shared/order-number";
export function PrintCenter({ data }: { data: Workspace }) {
  const { t } = useOps();
  const ticketText = (key: string) => translateOps("en", key);
  const [selected, setSelected] = useState("");
  const [destination, setDestination] = useState<PrinterDestination>("kitchen");
  const order = data.orders.find((o) => o.id === selected);
  const ticketLines = order ? ticketSnapshot(order) : null;
  return (
    <div className="ops-print">
      <section className="ops-printer-grid">
        {PRINTER_TARGETS.map((p) => (
          <article className="ops-panel" key={p.destination}>
            <Printer size={28} aria-hidden />
            <h2>
              {t(
                p.destination === "kitchen"
                  ? "Kitchen ticket"
                  : "Reception ticket",
              )}
            </h2>
            <p>{p.model}</p>
            <strong className="ops-status-pill">
              {t("Printer connection not configured")}
            </strong>
            <p>{t("Known model · connectivity not verified")}</p>
          </article>
        ))}
      </section>
      <section className="ops-panel">
        <h2>{t("Ticket preview")}</h2>
        <p>{t("Preview only · no print job is created or sent")}</p>
        <div className="co-two">
          <label>
            {t("Order")}
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">{t("Select an order")}</option>
              {data.orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {orderReference(o)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("Destination")}
            <select
              value={destination}
              onChange={(e) =>
                setDestination(e.target.value as PrinterDestination)
              }
            >
              <option value="kitchen">{t("Kitchen ticket")}</option>
              <option value="reception">{t("Reception ticket")}</option>
            </select>
          </label>
        </div>
        {order && !ticketLines ? (
          <p role="alert" className="co-empty">
            {t(
              "Review required: the stored order catalog snapshot is missing or inconsistent. Ticket preview is unavailable.",
            )}
          </p>
        ) : order && ticketLines ? (
          <article className="ops-ticket" lang="en" aria-label="Ticket preview">
            <p className="ops-kicker">{ticketText("PREVIEW")}</p>
            <h3>Pastelerías 3L · {orderReference(order)}</h3>
            <p>
              {ticketText(
                destination === "kitchen"
                  ? "Kitchen ticket"
                  : "Reception ticket",
              )}{" "}
              · {ticketText(order.state)}
            </p>
            <p>
              {ticketText(
                order.fulfillmentMethod === "pickup" ? "Pickup" : "Entrega",
              )}
            </p>
            <ul>
              {ticketLines.map((l) => (
                <li key={lineKey(l)}>
                  <strong>{l.quantity} × </strong>
                  <OperationalProductName
                    product={operationalProductName(l.productId, l.name)}
                    id={l.productId}
                  />
                  <p lang="en">
                    Unit price: AED {(l.priceFils / 100).toFixed(2)} · Line
                    total: AED {((l.priceFils * l.quantity) / 100).toFixed(2)}
                  </p>
                  {preparationText(l) && <p lang="en">{preparationText(l)}</p>}
                </li>
              ))}
            </ul>
            <p>
              {order.pickup?.pickupDate || order.delivery?.date
                ? formatOpsDate(
                    order.pickup?.pickupDate ?? order.delivery!.date!,
                    "en",
                    false,
                  )
                : ticketText("Sin fecha")}{" "}
              · {order.pickup?.preferredTime ?? order.delivery?.slot}
            </p>
            {order.customerDetails?.instructions && (
              <p>
                <strong>Original customer notes: </strong>
                {order.customerDetails.instructions}
              </p>
            )}
            {order.delivery?.notes && (
              <p>
                <strong>Original delivery notes: </strong>
                {order.delivery.notes}
              </p>
            )}
            {destination === "reception" && (
              <p>
                {
                  data.conversations.find((c) => c.id === order.conversationId)
                    ?.customer
                }
              </p>
            )}
          </article>
        ) : (
          <p className="co-empty">
            {t("Select a permitted order to preview its ticket")}
          </p>
        )}
      </section>
      <section className="ops-panel">
        <h2>{t("Print jobs")}</h2>
        <p>
          {t(
            "Print job tracking is not configured. No job history is available.",
          )}
        </p>
        <p className="co-muted">
          {t(
            "Registration, health, queues, retry and authorized reprints are deferred",
          )}
        </p>
      </section>
    </div>
  );
}
