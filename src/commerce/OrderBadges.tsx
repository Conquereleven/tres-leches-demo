import {
  CheckCircle,
  Clock,
  CookingPot,
  HandCoins,
  MinusCircle,
  Package,
  PencilSimple,
  Prohibit,
  SealCheck,
  Truck,
  Warning,
  WarningOctagon,
} from "@phosphor-icons/react";
import type { Order, Payment } from "../../server/domain/model";
import { useOps } from "./ops-i18n";
import { paymentBadge, type PaymentTone } from "./orders-board";
import {
  fulfilmentGroup,
  fulfilmentLabel,
  type FulfilmentGroup,
} from "./order-view";

/** State is always carried by an icon and a label, never by colour alone. */
const PAYMENT_ICON: Record<PaymentTone, typeof CheckCircle> = {
  paid: CheckCircle,
  pending: Clock,
  review: Warning,
  issue: WarningOctagon,
  none: MinusCircle,
};
const FULFILMENT_ICON: Record<FulfilmentGroup, typeof CheckCircle> = {
  draft: PencilSimple,
  unpaid: HandCoins,
  "to-confirm": Clock,
  confirmed: SealCheck,
  preparing: CookingPot,
  ready: Package,
  out: Truck,
  completed: CheckCircle,
  cancelled: Prohibit,
};

export function PaymentBadge({
  payment,
}: {
  payment?: Pick<Payment, "status" | "directAttempt">;
}) {
  const { t } = useOps();
  const badge = paymentBadge(payment);
  const Icon = PAYMENT_ICON[badge.tone];
  return (
    <span className="oms-badge" data-kind="payment" data-tone={badge.tone}>
      <Icon weight={badge.tone === "paid" ? "fill" : "regular"} aria-hidden />
      {t(badge.label)}
    </span>
  );
}

export function FulfilmentBadge({
  order,
}: {
  order: Pick<Order, "state" | "fulfillmentMethod">;
}) {
  const { t } = useOps();
  const group = fulfilmentGroup(order.state);
  const Icon = FULFILMENT_ICON[group];
  return (
    <span className="oms-badge" data-kind="fulfilment" data-tone={group}>
      <Icon weight={group === "completed" ? "fill" : "regular"} aria-hidden />
      {t(fulfilmentLabel(order))}
    </span>
  );
}
