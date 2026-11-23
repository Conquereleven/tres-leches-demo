import { INK, type Style } from "./print-canvas";

/** P3 only. Targets are physical PDF points after the existing A5 transform. */
export function deliveryType(layout: "a4" | "a5" | "a5-two-up" = "a4") {
  const scale = layout === "a4" ? 1 : 148 / 210;
  const style = (
    old: number,
    physical: number,
    weight: Style["weight"] = 600,
    leading = 1.25,
  ): Style => ({
    size: Math.max(old, physical / scale),
    weight,
    leading,
    color: INK,
  });
  return {
    scale,
    label: { ...style(7.4, 7), upper: true, spacing: 0.06 },
    small: style(7.6, 7),
    body: style(11, 10),
    item: style(10, 10, 700),
    detail: style(8.6, 9),
    heading: style(11.5, 11, 700),
    value: style(14, 10.5, 700),
    recipient: style(17, 13, 800, 1.15),
    address: style(13, 10.5),
    phone: style(12, 10.5, 700),
    quantity: style(12, 12, 800, 1.05),
    footer: style(6.5, 7),
  };
}
export type DeliveryType = ReturnType<typeof deliveryType>;
