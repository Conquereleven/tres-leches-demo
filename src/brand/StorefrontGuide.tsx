import {
  Cake,
  Ruler,
  ShoppingBag,
  ListChecks,
  Truck,
  CalendarBlank,
  User,
  CreditCard,
  CheckCircle,
  ArrowRight,
} from "@phosphor-icons/react";
import { ResponsiveMedia } from "./media";
import { menuFamilies, storefrontProducts, productHref } from "./menu";
import { CustomerCopy } from "./localization";
const previews = [
  {
    title: "Tres Leches Cakes",
    family: "tres-leches",
    variant: "Coconut",
    href: "/menu?category=cakes",
  },
  {
    title: "Special Flavours",
    family: "special-flavours-cake",
    variant: "Pistacchio",
    href: productHref(
      storefrontProducts.find(
        (p) => p.id === "special-flavours-cake--pistacchio",
      )!,
    ),
  },
  {
    title: "Cake Jars",
    family: "cake-jar",
    variant: "Classic",
    href: "/menu?category=jars",
  },
  {
    title: "Conchas",
    family: "conchas-traditional",
    variant: "Chocolate",
    href: "/menu?category=conchas",
  },
  {
    title: "Pan de Muerto",
    family: "pan-de-muerto-traditional",
    variant: "Azúcar",
    href: "/menu?category=pan",
  },
  {
    title: "Panadería Mexicana",
    family: "croissant",
    variant: "Plain",
    href: "/menu?category=bakery",
  },
];
export function MenuPreview() {
  return (
    <section
      className="b-menu-preview b-section"
      aria-labelledby="preview-title"
    >
      <p className="b-label">THE 3L MENU</p>
      <h2 id="preview-title" className="b-heading">
        Find your sweet moment.
      </h2>
      <div className="b-preview-grid">
        {previews.map((p) => (
          <a key={p.title} href={p.href}>
            <figure>
              {p.family === "croissant" ? (
                <span className="b-preview-no-photo" aria-hidden="true">
                  3L
                </span>
              ) : (
                <ResponsiveMedia
                  family={p.family}
                  variant={p.variant}
                  fallback={menuFamilies.find((f) => f.id === p.family)?.image}
                  alt={`${p.title} · family photograph`}
                />
              )}
            </figure>
            <span>
              {p.title}
              <ArrowRight aria-hidden />
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
const steps = [
  [Cake, "Choose your cake", "Find your favourite flavour."],
  [Ruler, "Choose the size", "Select a size or pack."],
  [ShoppingBag, "Add to cart", "Choose how many you need."],
  [ListChecks, "Review your cart", "Check your items and total."],
  [ArrowRight, "Continue to Fulfillment", "Move to the next step."],
  [Truck, "Delivery or pickup", "Tell us where you need it."],
  [CalendarBlank, "Choose date & time", "Pick an available window."],
  [User, "Add your details", "Contact and billing information."],
  [CreditCard, "Pay securely", "Continue to Paymennt."],
  [CheckCircle, "Receive confirmation", "Return to 3L to track your order."],
] as const;
export function HowToOrderGuide() {
  return (
    <section
      id="how-to-order"
      className="b-how-guide b-section"
      aria-labelledby="how-title"
    >
      <p className="b-label">A FEW SIMPLE STEPS</p>
      <h2 id="how-title" className="b-heading">
        How to order?
      </h2>
      <ol>
        {steps.map(([Icon, title, copy], i) => (
          <li key={title}>
            <span className="b-step-number" aria-hidden>
              {String(i + 1).padStart(2, "0")}
            </span>
            <Icon aria-hidden />
            <h3>
              <CustomerCopy>{title}</CustomerCopy>
            </h3>
            <p>
              <CustomerCopy>{copy}</CustomerCopy>
            </p>
          </li>
        ))}
      </ol>
      <a className="b-button" href="/menu">
        EXPLORE THE MENU <ArrowRight aria-hidden />
      </a>
      <a className="b-link" href="/how-to-order">
        Delivery, minimums & timing
      </a>
    </section>
  );
}
