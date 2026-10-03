import { useLanguage as useCustomerLanguage } from "./localization";
import { CustomerCopy } from "./localization";
/**
 * Customer policy and contact pages. Copy reflects how ordering actually works
 * (WhatsApp → zone/minimum check → hosted Paymennt link → confirmed only after
 * verified payment). Owner decisions come from business.ts; unknown values are
 * omitted or described as a team review, never invented.
 */
import { useEffect, type ReactNode } from "react";
import { ArrowUpRight } from "@phosphor-icons/react";
import {
  business,
  cancellationCutoffHours,
  cancellationFeePercent,
  cancellationRefundPercent,
  contactChannels,
  deliveryBands,
  freeDeliveryAreas,
  legalEntityLabel,
  policyDecisions as decide,
  policyRoutes,
  type PolicyPath,
} from "./business";
import { SectionLabel, StarMotif } from "./primitives";
import { OrderAcknowledgement, SiteFooter, SiteHeader } from "./SiteChrome";
// Styles come from brand.css, loaded with the storefront bundle via Root → Experience.

type Section = { id: string; title: string; body: ReactNode };
type Page = {
  label: string;
  title: string;
  metaTitle: string;
  description: string;
  intro: ReactNode;
  summary?: { title: string; text: ReactNode }[];
  sections: Section[];
};

const L = ({ to, children }: { to: PolicyPath; children: ReactNode }) => (
  <a href={to}>{children}</a>
);
const who = () => business.legalName ?? business.tradingName;
// Short aliases for the confirmed cancellation rule, used across several pages.
const cutoff = cancellationCutoffHours;
const refundPct = cancellationRefundPercent;
const feePct = cancellationFeePercent;

function ContactDetails({ contactPage = false }: { contactPage?: boolean }) {
  const channels = contactChannels({ contactPage });
  return (
    <>
      {channels.length > 0 && (
        <ul className="b-policy-channels">
          {channels.map((c) => (
            <li key={c.kind}>
              <span className="b-label">
                <CustomerCopy>{c.label}</CustomerCopy>
              </span>
              <a
                href={c.href}
                {...(c.kind === "whatsapp"
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
              >
                {c.value}
              </a>
            </li>
          ))}
        </ul>
      )}
      <dl className="b-policy-facts">
        <div>
          <dt>
            {" "}
            <CustomerCopy>Business</CustomerCopy>{" "}
          </dt>
          <dd>{legalEntityLabel()}</dd>
        </div>
        {business.tradeLicence && (
          <div>
            <dt>
              {" "}
              <CustomerCopy>Trade licence</CustomerCopy>{" "}
            </dt>
            <dd>{business.tradeLicence}</dd>
          </div>
        )}
        <div>
          <dt>
            <CustomerCopy>
              {business.address ? "Address" : "Location"}
            </CustomerCopy>
          </dt>
          <dd>{business.address ?? `${business.city}, ${business.country}`}</dd>
        </div>
        {business.supportHours && (
          <div>
            <dt>
              {" "}
              <CustomerCopy>Customer care hours</CustomerCopy>{" "}
            </dt>
            <dd>{business.supportHours}</dd>
          </div>
        )}
      </dl>
    </>
  );
}

const contactSection = (id = "contact"): Section => ({
  id,
  title: "Contact us",
  body: (
    <>
      <p>
        {" "}
        <CustomerCopy>
          Questions about this policy or an order can be sent to our customer
          care team. Please include your order reference where you have one.
        </CustomerCopy>{" "}
      </p>
      <ContactDetails />
    </>
  ),
});

const orderingSteps = (
  <ol>
    <li>
      {" "}
      <CustomerCopy>
        Message us on WhatsApp with what you would like. Our team confirms the
        items, availability and prices in AED.
      </CustomerCopy>{" "}
    </li>
    <li>
      {" "}
      <CustomerCopy>
        Share your delivery location — ideally a WhatsApp location pin — so we
        can confirm the delivery area and its minimum order value.
      </CustomerCopy>{" "}
    </li>
    <li>
      {" "}
      <CustomerCopy>
        We send you a secure payment link showing the total amount, including
        any delivery charge.
      </CustomerCopy>{" "}
    </li>
    <li>
      {" "}
      <CustomerCopy>
        Pay by Visa or Mastercard on the secure page hosted by our payment
        provider,
      </CustomerCopy>{" "}
      {business.paymentProcessor}{" "}
      <CustomerCopy>
        . Your order is confirmed once the payment has been verified.
      </CustomerCopy>{" "}
    </li>
    <li>
      {" "}
      <CustomerCopy>
        We prepare your order and deliver it at the date and time agreed with
        you.
      </CustomerCopy>{" "}
    </li>
  </ol>
);

function DeliveryAreas() {
  return (
    <div className="b-policy-zones">
      <article>
        <p className="b-label">
          {" "}
          <CustomerCopy>Free delivery · Minimum AED</CustomerCopy>{" "}
          {freeDeliveryAreas.minOrderAed}
        </p>
        <ul>
          {freeDeliveryAreas.areas.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </article>
      {deliveryBands.map((band) => (
        <article key={band.minOrderAed}>
          <p className="b-label">
            {" "}
            <CustomerCopy>Minimum order AED</CustomerCopy> {band.minOrderAed}
          </p>
          <ul>
            {band.areas.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}

export const pages: Record<PolicyPath, Page> = {
  "/terms": {
    label: "Customer information",
    title: "Terms & Conditions",
    metaTitle: "Terms & Conditions",
    description: `The terms that apply when you order from ${business.tradingName} in Dubai.`,
    intro: (
      <p>
        {" "}
        <CustomerCopy>
          These terms apply when you use this website or order from
        </CustomerCopy>{" "}
        <strong>{legalEntityLabel()}</strong>{" "}
        <CustomerCopy>
          . Please read them before placing an order.
        </CustomerCopy>{" "}
      </p>
    ),
    sections: [
      {
        id: "about",
        title: "1. Who we are",
        body: (
          <>
            <p>
              {" "}
              <CustomerCopy>
                This website and our ordering service are operated by
              </CustomerCopy>{" "}
              <strong>{business.legalName ?? business.tradingName}</strong>
              {business.legalName ? (
                <>
                  {" "}
                  <CustomerCopy>
                    , the legal entity behind the
                  </CustomerCopy>{" "}
                  <strong>{business.tradingName}</strong>{" "}
                  <CustomerCopy>brand</CustomerCopy>{" "}
                </>
              ) : null}
              {business.tradeLicence
                ? ` (trade licence ${business.tradeLicence})`
                : ""}
              .{" "}
              {business.address
                ? `Our business address is ${business.address}.`
                : `We are based in ${business.city}, ${business.country}.`}
            </p>
            <p>
              {" "}
              <CustomerCopy>
                In these terms, “we”, “us”, “our” and “3L” mean
              </CustomerCopy>{" "}
              {who()} <CustomerCopy>, and</CustomerCopy> {business.tradingName}{" "}
              <CustomerCopy>
                is the customer-facing brand under which we trade. “You” means
                the person placing the order or using this website.
              </CustomerCopy>{" "}
            </p>
          </>
        ),
      },
      {
        id: "acceptance",
        title: "2. Accepting these terms",
        body: (
          <p>
            {" "}
            <CustomerCopy>
              By using this website or placing an order with us, you agree to
              these Terms &amp; Conditions together with our
            </CustomerCopy>{" "}
            <L to="/refund-policy">
              {" "}
              <CustomerCopy>Refund &amp; Cancellation Policy</CustomerCopy>{" "}
            </L>
            ,{" "}
            <L to="/delivery-policy">
              {" "}
              <CustomerCopy>Delivery Policy</CustomerCopy>{" "}
            </L>{" "}
            <CustomerCopy>and</CustomerCopy>{" "}
            <L to="/privacy">
              {" "}
              <CustomerCopy>Privacy Policy</CustomerCopy>{" "}
            </L>{" "}
            <CustomerCopy>
              , which form part of these terms. If you do not agree, please do
              not place an order.
            </CustomerCopy>{" "}
          </p>
        ),
      },
      {
        id: "products",
        title: "3. Our products",
        body: (
          <>
            <p>
              {" "}
              <CustomerCopy>
                We make Tres Leches cakes, cake jars, bakery items and custom
                cakes. Products are freshly prepared and perishable. Because
                they are handmade, colours, decoration and finish may vary
                slightly from photographs, which are for illustration only.
              </CustomerCopy>{" "}
            </p>
            <p>
              {" "}
              <CustomerCopy>
                Custom cakes are made to the details you confirm with our team
                (size, flavour, design and any text). Please check these details
                carefully before paying. By sending us images or text for a
                custom design, you confirm that you are entitled to use them.
              </CustomerCopy>{" "}
            </p>
            <p>
              {" "}
              <CustomerCopy>
                Our products are made with ingredients such as milk, eggs and
                wheat flour. If you or anyone eating the product has an allergy
                or dietary requirement, tell us before you order so our team can
                advise you. We cannot guarantee that any product is free from
                allergens.
              </CustomerCopy>{" "}
            </p>
          </>
        ),
      },
      {
        id: "ordering",
        title: "4. How ordering works",
        body: (
          <>
            <p>
              {" "}
              <CustomerCopy>
                Orders are placed with our team through WhatsApp:
              </CustomerCopy>{" "}
            </p>
            {orderingSteps}
          </>
        ),
      },
      {
        id: "pricing",
        title: "5. Prices",
        body: (
          <p>
            {" "}
            <CustomerCopy>
              Prices are in UAE dirhams (AED). The total you pay — products plus
              any delivery charge — is shown on your payment link before you
              pay. Each delivery area has a minimum order value, set out in our
            </CustomerCopy>{" "}
            <L to="/delivery-policy">
              {" "}
              <CustomerCopy>Delivery Policy</CustomerCopy>{" "}
            </L>{" "}
            <CustomerCopy>
              . If a price shown to you is clearly wrong, we will contact you
              before taking payment.
            </CustomerCopy>{" "}
          </p>
        ),
      },
      {
        id: "payment",
        title: "6. Payment",
        body: (
          <>
            <p>
              {" "}
              <CustomerCopy>
                Orders are paid in full, in advance, by Visa or Mastercard
                through a secure payment page hosted by our payment provider,
              </CustomerCopy>{" "}
              {business.paymentProcessor}{" "}
              <CustomerCopy>
                . Your card details are entered directly on that page;
              </CustomerCopy>{" "}
              {business.tradingName}{" "}
              <CustomerCopy>
                does not receive or store your full card number or security
                code.
              </CustomerCopy>{" "}
            </p>
            <p>
              {" "}
              <CustomerCopy>
                Payment links are valid for a limited time. If a link expires
                before you pay, nothing is charged and our team can send you a
                new one.
              </CustomerCopy>{" "}
            </p>
          </>
        ),
      },
      {
        id: "acceptance-of-orders",
        title: "7. When your order is confirmed",
        body: (
          <>
            <p>
              {" "}
              <CustomerCopy>
                Your order is accepted and confirmed only once your payment has
                been verified with our payment provider. Reaching the payment
                page, or being redirected after it, does not by itself confirm
                an order.
              </CustomerCopy>{" "}
            </p>
            <p>
              {" "}
              <CustomerCopy>
                We may decline an order before payment — for example if the
                delivery address is outside our delivery area, the order is
                below the area’s minimum value, or a product is unavailable. If,
                after payment, we cannot fulfil all or part of your order, we
                will contact you and refund the amount paid for anything we
                cannot supply.
              </CustomerCopy>{" "}
            </p>
          </>
        ),
      },
      {
        id: "your-information",
        title: "8. Your responsibilities",
        body: (
          <p>
            {" "}
            <CustomerCopy>
              You are responsible for giving us accurate and complete
              information: your name and mobile number, the recipient’s details,
              the exact delivery location and access instructions, the details
              of any custom design, and any allergy information. Problems caused
              by incorrect or incomplete information are handled under our
            </CustomerCopy>{" "}
            <L to="/delivery-policy">
              {" "}
              <CustomerCopy>Delivery Policy</CustomerCopy>{" "}
            </L>{" "}
            <CustomerCopy>and</CustomerCopy>{" "}
            <L to="/refund-policy">
              {" "}
              <CustomerCopy>Refund &amp; Cancellation Policy</CustomerCopy>{" "}
            </L>
            .
          </p>
        ),
      },
      {
        id: "delivery",
        title: "9. Delivery",
        body: (
          <p>
            {" "}
            <CustomerCopy>
              We deliver within the Dubai areas listed in our
            </CustomerCopy>{" "}
            <L to="/delivery-policy">
              {" "}
              <CustomerCopy>Delivery Policy</CustomerCopy>{" "}
            </L>{" "}
            <CustomerCopy>
              , which explains delivery areas, minimum order values, charges,
              scheduling and what happens if a delivery cannot be completed.
            </CustomerCopy>{" "}
          </p>
        ),
      },
      {
        id: "cancellation",
        title: "10. Cancellations and refunds",
        body: (
          <>
            <p>
              {" "}
              <CustomerCopy>
                You can cancel an order at no cost before you pay. Once payment
                is verified your order is confirmed.
              </CustomerCopy>{" "}
            </p>
            <p>
              <CustomerCopy>{`A confirmed order may be cancelled up to ${cutoff} hours before the scheduled delivery time. We then refund ${refundPct}% of the amount paid and retain ${feePct}% as a cancellation and administrative fee. If fewer than ${cutoff} hours remain before the scheduled delivery time, the order cannot be cancelled and is non-refundable.`}</CustomerCopy>
            </p>
            <p>
              {" "}
              <CustomerCopy>
                The full rules, including the other circumstances in which we
                issue a refund, are in our
              </CustomerCopy>{" "}
              <L to="/refund-policy">
                {" "}
                <CustomerCopy>
                  Refund &amp; Cancellation Policy
                </CustomerCopy>{" "}
              </L>
              .
            </p>
          </>
        ),
      },
      {
        id: "website",
        title: "11. Using this website",
        body: (
          <p>
            {" "}
            <CustomerCopy>
              You may use this website to learn about our products and to
              contact us. You must not misuse it, interfere with its operation,
              attempt to access areas that are not intended for customers, or
              copy our name, logos, photographs or content for commercial use
              without our written permission. The staff operations area is for
              authorised
            </CustomerCopy>{" "}
            {business.tradingName}{" "}
            <CustomerCopy>team members only.</CustomerCopy>{" "}
          </p>
        ),
      },
      {
        id: "liability",
        title: "12. Our responsibility to you",
        body: (
          <>
            <p>
              {" "}
              <CustomerCopy>
                We take care to prepare and deliver your order as agreed. To the
                extent permitted by the laws of the United Arab Emirates, we are
                not responsible for losses that were not reasonably foreseeable,
                for delays or failures caused by events outside our reasonable
                control, or for products that are stored or handled incorrectly
                after delivery. Where we are responsible, our liability is
                limited to the amount you paid for the affected order.
              </CustomerCopy>{" "}
            </p>
            <p>
              {" "}
              <CustomerCopy>
                Nothing in these terms limits any rights you have under
                applicable UAE consumer protection law.
              </CustomerCopy>{" "}
            </p>
          </>
        ),
      },
      {
        id: "changes",
        title: "13. Changes to these terms",
        body: (
          <p>
            {" "}
            <CustomerCopy>
              We may update these terms from time to time. The version published
              on this page when you pay for your order applies to that order.
            </CustomerCopy>{" "}
          </p>
        ),
      },
      {
        id: "law",
        title: "14. Governing law",
        body: (
          <p>
            {" "}
            <CustomerCopy>
              These terms are governed by the laws of the United Arab Emirates
              as applied in the Emirate of Dubai.
            </CustomerCopy>{" "}
          </p>
        ),
      },
      contactSection("contact"),
    ],
  },

  "/privacy": {
    label: "Customer information",
    title: "Privacy Policy",
    metaTitle: "Privacy Policy",
    description: `How ${business.tradingName} collects, uses and protects your information.`,
    intro: (
      <p>
        {" "}
        <CustomerCopy>This policy explains what information</CustomerCopy>{" "}
        {legalEntityLabel()}{" "}
        <CustomerCopy>
          collects when you visit this website or order from us, how we use it,
          and the choices you have.
        </CustomerCopy>{" "}
      </p>
    ),
    summary: [
      {
        title: "No card storage",
        text: `Card details are entered on ${business.paymentProcessor}’s secure hosted page. We never receive your full card number or security code.`,
      },
      {
        title: "No tracking cookies",
        text: "This website does not use analytics or advertising cookies.",
      },
      {
        title: "Used for your order",
        text: "We use your details to prepare, deliver and support your order — never sold.",
      },
    ],
    sections: [
      {
        id: "controller",
        title: "1. Who is responsible for your information",
        body: (
          <p>
            {legalEntityLabel()} <CustomerCopy>, based in</CustomerCopy>{" "}
            {business.city}, {business.country}{" "}
            <CustomerCopy>
              , is responsible for the personal information described in this
              policy. You can reach us using the details at the end of this
              page.
            </CustomerCopy>{" "}
          </p>
        ),
      },
      {
        id: "collect",
        title: "2. Information we collect",
        body: (
          <>
            <h3>
              {" "}
              <CustomerCopy>When you message us on WhatsApp</CustomerCopy>{" "}
            </h3>
            <p>
              {" "}
              <CustomerCopy>
                Your mobile number, WhatsApp profile name, the messages you send
                us, and any location pin you share.
              </CustomerCopy>{" "}
            </p>
            <h3>
              {" "}
              <CustomerCopy>When you place an order</CustomerCopy>{" "}
            </h3>
            <p>
              {" "}
              <CustomerCopy>
                The products you order and their prices, your delivery address
                or location, the delivery area it falls in, recipient name and
                phone number if different from yours, access instructions, and
                notes you give us — such as a cake message, design details or
                allergy information. We also keep a record of each order’s
                status (for example, confirmed, out for delivery, delivered).
              </CustomerCopy>{" "}
            </p>
            <h3>
              {" "}
              <CustomerCopy>When you pay</CustomerCopy>{" "}
            </h3>
            <p>
              {" "}
              <CustomerCopy>
                You enter your card details on a secure page hosted by
              </CustomerCopy>{" "}
              {business.paymentProcessor}{" "}
              <CustomerCopy>
                . We do not receive or store your full card number or security
                code. We receive the payment result from
              </CustomerCopy>{" "}
              {business.paymentProcessor}{" "}
              <CustomerCopy>
                — status, amount, currency and a transaction reference — so we
                can confirm your order and handle any refund.
              </CustomerCopy>{" "}
            </p>
            <h3>
              {" "}
              <CustomerCopy>When you visit this website</CustomerCopy>{" "}
            </h3>
            <p>
              {" "}
              <CustomerCopy>
                You do not need an account to browse. The website does not use
                analytics, advertising or tracking cookies. It uses your
                browser’s session storage only to remember that you have already
                seen the opening animation. Like any website, our hosting
                provider processes technical information such as your IP address
                and browser type to deliver and secure the site.
              </CustomerCopy>{" "}
            </p>
          </>
        ),
      },
      {
        id: "use",
        title: "3. How we use your information",
        body: (
          <ul>
            <li>
              {" "}
              <CustomerCopy>
                To reply to your enquiries and take your order.
              </CustomerCopy>{" "}
            </li>
            <li>
              {" "}
              <CustomerCopy>
                To confirm your delivery area, its minimum order value and any
                delivery charge.
              </CustomerCopy>{" "}
            </li>
            <li>
              {" "}
              <CustomerCopy>
                To create your payment link, verify your payment and process
                approved refunds.
              </CustomerCopy>{" "}
            </li>
            <li>
              {" "}
              <CustomerCopy>
                To prepare and deliver your order and keep you updated.
              </CustomerCopy>{" "}
            </li>
            <li>
              {" "}
              <CustomerCopy>
                To handle questions, complaints and refund requests.
              </CustomerCopy>{" "}
            </li>
            <li>
              {" "}
              <CustomerCopy>
                To keep our systems secure, prevent fraud and meet our legal,
                tax and accounting obligations.
              </CustomerCopy>{" "}
            </li>
          </ul>
        ),
      },
      {
        id: "sharing",
        title: "4. Service providers we share information with",
        body: (
          <>
            <p>
              {" "}
              <CustomerCopy>
                We do not sell your personal information. We share it only with
                providers that help us run our service, and only as needed for
                their role:
              </CustomerCopy>{" "}
            </p>
            <ul>
              <li>
                <strong>{business.paymentProcessor}</strong>{" "}
                <CustomerCopy>
                  — processes card payments and refunds on our behalf.
                </CustomerCopy>{" "}
              </li>
              <li>
                <strong>
                  {" "}
                  <CustomerCopy>Meta (WhatsApp Business)</CustomerCopy>{" "}
                </strong>{" "}
                <CustomerCopy>
                  — carries the messages you exchange with us on WhatsApp.
                </CustomerCopy>{" "}
              </li>
              <li>
                <strong>
                  {" "}
                  <CustomerCopy>Mapbox</CustomerCopy>{" "}
                </strong>{" "}
                <CustomerCopy>
                  — where enabled, converts a shared location into an address so
                  we can identify your delivery area.
                </CustomerCopy>{" "}
              </li>
              <li>
                <strong>
                  {" "}
                  <CustomerCopy>OpenAI</CustomerCopy>{" "}
                </strong>{" "}
                <CustomerCopy>
                  — where enabled, provides AI tools that help our team prepare
                  replies to customer messages. Our team remains responsible for
                  orders, payments, refunds and cancellations.
                </CustomerCopy>{" "}
              </li>
              <li>
                <strong>
                  {" "}
                  <CustomerCopy>Cloud hosting provider</CustomerCopy>{" "}
                </strong>{" "}
                <CustomerCopy>
                  — hosts this website and our order system.
                </CustomerCopy>{" "}
              </li>
              <li>
                <strong>
                  {" "}
                  <CustomerCopy>Delivery staff</CustomerCopy>{" "}
                </strong>{" "}
                <CustomerCopy>
                  — receive the recipient details and location needed to deliver
                  your order.
                </CustomerCopy>{" "}
              </li>
            </ul>
            <p>
              {" "}
              <CustomerCopy>
                Some of these providers may process information outside the UAE.
                We may also disclose information where required by law or by a
                competent authority.
              </CustomerCopy>{" "}
            </p>
          </>
        ),
      },
      {
        id: "marketing",
        title: "5. Marketing",
        body: (
          <p>
            {" "}
            <CustomerCopy>
              We only send you marketing messages if you have agreed to receive
              them, and you can opt out at any time. Our newsletter sign-up is
              not active yet, so we do not currently collect email addresses
              through this website.
            </CustomerCopy>{" "}
          </p>
        ),
      },
      {
        id: "retention",
        title: "6. How long we keep information",
        body: (
          <p>
            {" "}
            <CustomerCopy>
              We keep order, payment and conversation records only for as long
              as they are needed for the purposes above, including resolving
              questions about an order and meeting legal, tax and accounting
              record-keeping requirements.
            </CustomerCopy>{" "}
          </p>
        ),
      },
      {
        id: "security",
        title: "7. Security",
        body: (
          <p>
            {" "}
            <CustomerCopy>
              This website is served over an encrypted (HTTPS) connection. Our
              order system can only be accessed by authorised team members with
              individual accounts and role-based permissions. Card payments are
              handled entirely on our payment provider’s secure page.
            </CustomerCopy>{" "}
          </p>
        ),
      },
      {
        id: "rights",
        title: "8. Your choices and rights",
        body: (
          <p>
            {" "}
            <CustomerCopy>
              Subject to applicable UAE data protection law, you can ask us for
              a copy of the personal information we hold about you, ask us to
              correct it, ask us to delete it where we are not required to keep
              it, or object to marketing. Contact us using the details below and
              we will respond to your request.
            </CustomerCopy>{" "}
          </p>
        ),
      },
      {
        id: "changes",
        title: "9. Changes to this policy",
        body: (
          <p>
            {" "}
            <CustomerCopy>
              We may update this policy from time to time. The date at the top
              of this page shows when it was last updated.
            </CustomerCopy>{" "}
          </p>
        ),
      },
      contactSection(),
    ],
  },

  "/refund-policy": {
    label: "Customer information",
    title: "Refund & Cancellation Policy",
    metaTitle: "Refund & Cancellation Policy",
    description: `When ${business.tradingName} orders can be cancelled, when refunds apply and how to request one.`,
    intro: (
      <p>
        {" "}
        <CustomerCopy>
          Our cakes are freshly prepared, perishable food. This policy explains
          when an order can be cancelled, when a refund is possible, and how to
          ask for one.
        </CustomerCopy>{" "}
      </p>
    ),
    summary: [
      {
        title: "Before payment",
        text: "Cancel or change your order at any time, free of charge. Nothing is charged until you complete payment.",
      },
      {
        title: `${cutoff} hours or more before delivery`,
        text: `You can cancel your order. We refund ${refundPct}% of the amount paid and retain ${feePct}% as a cancellation and administrative fee.`,
      },
      {
        title: `Less than ${cutoff} hours before delivery`,
        text: "The order can no longer be cancelled, and it is non-refundable.",
      },
      {
        title: "Something wrong?",
        text: `Damaged, incorrect or missing items: contact us ${decide.issueReportWindow ?? "as soon as possible after delivery"} with your order reference and photos.`,
      },
      {
        title: "Approved refunds",
        text: `Returned to the card you paid with, through our payment provider, ${business.paymentProcessor}.`,
      },
    ],
    sections: [
      {
        id: "before-payment",
        title: "1. Cancelling before payment",
        body: (
          <p>
            {" "}
            <CustomerCopy>
              An order is not confirmed until payment has been verified. Before
              you pay, you can cancel or change your order at any time by
              telling us on WhatsApp — or simply by not completing the payment.
              Nothing is charged. Payment links expire after a limited time; an
              expired link cannot be used to take payment.
            </CustomerCopy>{" "}
          </p>
        ),
      },
      {
        id: "after-payment",
        title: "2. Cancelling after payment",
        body: (
          <>
            <p>
              {" "}
              <CustomerCopy>
                Once your payment is verified, your order is confirmed and
                scheduled for preparation. Paid orders cannot be cancelled
                automatically — please contact us to request a cancellation.
              </CustomerCopy>{" "}
            </p>
            <p>
              <CustomerCopy>{`You can cancel a paid order up to ${cutoff} hours before the scheduled delivery time. Where we receive your request within that period, we refund ${refundPct}% of the amount you paid and retain ${feePct}% as a cancellation and administrative fee.`}</CustomerCopy>
            </p>
            <p>
              {" "}
              <CustomerCopy>If fewer than</CustomerCopy> {cutoff}{" "}
              <CustomerCopy>
                hours remain before the scheduled delivery time, the order can
                no longer be cancelled and it is
              </CustomerCopy>{" "}
              <strong>
                {" "}
                <CustomerCopy>non-refundable</CustomerCopy>{" "}
              </strong>{" "}
              <CustomerCopy>
                . Our products are freshly made to order and perishable, and
                preparation is already under way by that point.
              </CustomerCopy>{" "}
            </p>
            <p>
              {" "}
              <CustomerCopy>
                We will confirm the refund amount to you before processing it.
              </CustomerCopy>{" "}
            </p>
          </>
        ),
      },
      {
        id: "changes",
        title: "3. Changing a paid order",
        body: (
          <p>
            {" "}
            <CustomerCopy>
              To change the items, date, time or delivery address of a paid
              order, contact us as soon as possible. We will tell you whether
              the change is possible. A new address may fall in a delivery area
              with a different minimum order value or delivery charge.
            </CustomerCopy>{" "}
          </p>
        ),
      },
      {
        id: "issues",
        title: "4. Damaged, incorrect or missing items",
        body: (
          <>
            <p>
              {" "}
              <CustomerCopy>
                Please check your order when it arrives. If anything is damaged,
                incorrect or missing, contact us
              </CustomerCopy>{" "}
              <CustomerCopy>
                {decide.issueReportWindow ??
                  "as soon as possible, ideally on the day of delivery"}
              </CustomerCopy>{" "}
              <CustomerCopy>, and include:</CustomerCopy>{" "}
            </p>
            <ul>
              <li>
                {" "}
                <CustomerCopy>your order reference;</CustomerCopy>{" "}
              </li>
              <li>
                {" "}
                <CustomerCopy>
                  clear photos of the product and its packaging as received;
                </CustomerCopy>{" "}
              </li>
              <li>
                {" "}
                <CustomerCopy>
                  a short description of the problem.
                </CustomerCopy>{" "}
              </li>
            </ul>
            <p>
              {" "}
              <CustomerCopy>
                Please keep the product and packaging until we have reviewed
                your report. Where we confirm that an item was damaged,
                incorrect or missing because of an error on our side, we will
                offer a replacement or a refund for the affected items, in line
                with applicable UAE consumer protection law.
              </CustomerCopy>{" "}
            </p>
          </>
        ),
      },
      {
        id: "when-refunds",
        title: "5. When a refund is available",
        body: (
          <>
            <p>
              {" "}
              <CustomerCopy>We issue a refund where:</CustomerCopy>{" "}
            </p>
            <ol>
              <li>
                {" "}
                <CustomerCopy>
                  we made an error with your order;
                </CustomerCopy>{" "}
              </li>
              <li>
                {" "}
                <CustomerCopy>
                  you received an incorrect product, and the issue can
                  reasonably be verified;
                </CustomerCopy>{" "}
              </li>
              <li>
                {" "}
                <CustomerCopy>
                  delivery of your order becomes impossible; or
                </CustomerCopy>{" "}
              </li>
              <li>
                {" "}
                <CustomerCopy>you cancel your order at least</CustomerCopy>{" "}
                {cutoff}{" "}
                <CustomerCopy>
                  hours before the scheduled delivery time.
                </CustomerCopy>{" "}
              </li>
            </ol>
            <p>
              <CustomerCopy>{`In cases 1 to 3 we refund the amount paid for the affected items. In case 4 we refund ${refundPct}% of the amount paid and retain ${feePct}% as a cancellation and administrative fee.`}</CustomerCopy>
            </p>
            <p>
              {" "}
              <CustomerCopy>Where fewer than</CustomerCopy> {cutoff}{" "}
              <CustomerCopy>
                hours remain before the scheduled delivery time, the order
                cannot be cancelled and no refund is available.
              </CustomerCopy>{" "}
            </p>
          </>
        ),
      },
      {
        id: "limitations",
        title: "6. When a refund may not be possible",
        body: (
          <>
            <p>
              {" "}
              <CustomerCopy>
                We may decline a refund request where:
              </CustomerCopy>{" "}
            </p>
            <ul>
              <li>
                {" "}
                <CustomerCopy>
                  the cancellation was requested with fewer than
                </CustomerCopy>{" "}
                {cutoff}{" "}
                <CustomerCopy>
                  hours remaining before the scheduled delivery time;
                </CustomerCopy>{" "}
              </li>
              <li>
                {" "}
                <CustomerCopy>
                  a delivery could not be completed because of incorrect
                  delivery details or because the recipient was unavailable (see
                  our
                </CustomerCopy>{" "}
                <L to="/delivery-policy">
                  {" "}
                  <CustomerCopy>Delivery Policy</CustomerCopy>{" "}
                </L>
                );
              </li>
              <li>
                {" "}
                <CustomerCopy>
                  the product was stored or handled incorrectly after delivery;
                </CustomerCopy>{" "}
              </li>
              <li>
                {" "}
                <CustomerCopy>
                  the concern relates only to the natural variation of a
                  handmade product, or to design details that were confirmed
                  before payment;
                </CustomerCopy>{" "}
              </li>
              <li>
                {" "}
                <CustomerCopy>
                  the issue is reported without the information needed to review
                  it.
                </CustomerCopy>{" "}
              </li>
            </ul>
            <p>
              {" "}
              <CustomerCopy>
                Because our products are perishable food, delivered items cannot
                be returned to us for resale. This does not affect your rights
                under applicable UAE consumer protection law.
              </CustomerCopy>{" "}
            </p>
          </>
        ),
      },
      {
        id: "how-to-request",
        title: "7. How to request a cancellation or refund",
        body: (
          <ol>
            <li>
              {" "}
              <CustomerCopy>
                Contact our customer care team on any of the numbers listed
                below.
              </CustomerCopy>{" "}
            </li>
            <li>
              {" "}
              <CustomerCopy>
                Give your order reference, the name on the order and the reason
                for your request, with photos if the order has a problem.
              </CustomerCopy>{" "}
            </li>
            <li>
              {" "}
              <CustomerCopy>
                Our team reviews the request, may ask you for more information,
                and tells you the outcome.
              </CustomerCopy>{" "}
            </li>
            <li>
              {" "}
              <CustomerCopy>
                If a refund is approved, we process it and confirm to you once
                it has been issued.
              </CustomerCopy>{" "}
            </li>
          </ol>
        ),
      },
      {
        id: "refund-method",
        title: "8. How refunds are paid",
        body: (
          <p>
            {" "}
            <CustomerCopy>
              Approved refunds are made to the original Visa or Mastercard card
              used for payment, through our payment provider,
            </CustomerCopy>{" "}
            {business.paymentProcessor}{" "}
            <CustomerCopy>
              . We cannot refund to a different card or account. Once we have
              issued the refund, the time it takes to appear on your statement
              depends on your card issuer.
            </CustomerCopy>{" "}
          </p>
        ),
      },
      contactSection(),
    ],
  },

  "/delivery-policy": {
    label: "Customer information",
    title: "Delivery Policy",
    metaTitle: "Delivery Policy",
    description: `Delivery areas, minimum order values, scheduling and failed delivery handling for ${business.tradingName} in Dubai.`,
    intro: (
      <p>
        {" "}
        <CustomerCopy>
          We deliver freshly prepared cakes, cake jars and bakery items across
          Dubai. This policy explains where we deliver, minimum order values,
          charges, scheduling and what happens if a delivery cannot be
          completed.
        </CustomerCopy>{" "}
      </p>
    ),
    summary: [
      {
        title: "Where",
        text: "Dubai only, in the communities listed below. We confirm your area before you pay.",
      },
      {
        title: "Minimum order",
        text: "Each area has a minimum order value, from AED 30 to AED 300.",
      },
      {
        title: "Delivery charge",
        text: "Delivery is included once your supported zone’s minimum order is reached. No additional delivery fee.",
      },
      {
        title: "When",
        text: decide.deliveryHours
          ? `Delivery date and time are agreed with our team when you order. We deliver ${decide.deliveryHours}.`
          : "Delivery date and time are agreed with our team on WhatsApp when you order.",
      },
    ],
    sections: [
      {
        id: "areas",
        title: "1. Delivery areas and minimum order values",
        body: (
          <>
            <p>
              {" "}
              <CustomerCopy>
                We deliver only within Dubai, to the communities listed below.
                Each area has a minimum order value (products only). If your
                area is not listed, please ask us before ordering. We do not
                take payment for an address outside our delivery area, below its
                minimum order value, or whose area we cannot confirm.
              </CustomerCopy>{" "}
            </p>
            <DeliveryAreas />
          </>
        ),
      },
      {
        id: "fees",
        title: "2. Delivery charges",
        body: (
          <p>
            {" "}
            <CustomerCopy>
              Delivery is included once your supported zone’s minimum order is
              reached. There is no additional delivery fee.
            </CustomerCopy>{" "}
          </p>
        ),
      },
      {
        id: "scheduling",
        title: "3. Scheduling your delivery",
        body: (
          <>
            <p>
              {" "}
              <CustomerCopy>
                The delivery date and time are agreed with our team on WhatsApp
                when you place your order, and are confirmed once your payment
                has been verified.
              </CustomerCopy>{" "}
              <CustomerCopy>
                {decide.deliveryHours
                  ? ` We deliver ${decide.deliveryHours}.`
                  : ""}
              </CustomerCopy>
              <CustomerCopy>
                {decide.orderLeadTime
                  ? ` Please order at least ${decide.orderLeadTime}.`
                  : " Please order early for custom cakes and busy dates, as availability is limited."}
              </CustomerCopy>
            </p>
            <p>
              {" "}
              <CustomerCopy>
                After payment, your order moves through preparation, ready and
                out for delivery. Our team can update you on WhatsApp.
              </CustomerCopy>{" "}
            </p>
          </>
        ),
      },
      {
        id: "your-details",
        title: "4. Your delivery information",
        body: (
          <>
            <p>
              {" "}
              <CustomerCopy>
                You are responsible for giving us accurate and complete delivery
                information:
              </CustomerCopy>{" "}
            </p>
            <ul>
              <li>
                {" "}
                <CustomerCopy>
                  the exact location — a WhatsApp location pin is best, as it is
                  how we confirm your delivery area;
                </CustomerCopy>{" "}
              </li>
              <li>
                {" "}
                <CustomerCopy>
                  the full address, including building or villa, apartment
                  number and community;
                </CustomerCopy>{" "}
              </li>
              <li>
                {" "}
                <CustomerCopy>
                  the recipient’s name and a reachable mobile number;
                </CustomerCopy>{" "}
              </li>
              <li>
                {" "}
                <CustomerCopy>
                  any access instructions, such as gate codes, concierge or
                  parking details.
                </CustomerCopy>{" "}
              </li>
            </ul>
            <p>
              {" "}
              <CustomerCopy>
                If you need to change delivery details after paying, tell us as
                soon as possible. A new address may be in a delivery area with a
                different minimum order value or charge.
              </CustomerCopy>{" "}
            </p>
          </>
        ),
      },
      {
        id: "receiving",
        title: "5. Receiving your order",
        body: (
          <p>
            {" "}
            <CustomerCopy>
              Please make sure someone is available to receive the order at the
              agreed time. Our cakes are fresh, milk-soaked products: check the
              order on arrival, keep cakes level, and refrigerate them promptly.
            </CustomerCopy>{" "}
          </p>
        ),
      },
      {
        id: "delays",
        title: "6. Delays",
        body: (
          <p>
            {" "}
            <CustomerCopy>
              We aim to deliver at the agreed time. Traffic, weather, building
              access or security checks, and very busy dates can cause delays
              outside our control. If we expect a significant delay, we will
              contact you.
            </CustomerCopy>{" "}
          </p>
        ),
      },
      {
        id: "failed-delivery",
        title: "7. If a delivery cannot be completed",
        body: (
          <>
            <p>
              {" "}
              <CustomerCopy>
                If our driver cannot reach the recipient, cannot access the
                location, or the delivery details are incorrect, we will try to
                contact you and the recipient by phone or WhatsApp.
              </CustomerCopy>{" "}
            </p>
            <p>
              <CustomerCopy>
                {decide.failedDeliveryOutcome ??
                  "If the delivery still cannot be completed, our team will contact you to agree the next steps. Because our products are perishable, we cannot hold them indefinitely, and any redelivery or refund is agreed with you by our team."}
              </CustomerCopy>{" "}
              <CustomerCopy>
                Where a delivery fails because of incorrect details or the
                recipient being unavailable, a refund may not be possible — see
                our
              </CustomerCopy>{" "}
              <L to="/refund-policy">
                {" "}
                <CustomerCopy>
                  Refund &amp; Cancellation Policy
                </CustomerCopy>{" "}
              </L>
              .
            </p>
          </>
        ),
      },
      {
        id: "problems",
        title: "8. Problems with a delivered order",
        body: (
          <p>
            {" "}
            <CustomerCopy>
              If your order arrives damaged, incorrect or incomplete, please
              follow the steps in our
            </CustomerCopy>{" "}
            <L to="/refund-policy">
              {" "}
              <CustomerCopy>Refund &amp; Cancellation Policy</CustomerCopy>{" "}
            </L>
            .
          </p>
        ),
      },
      contactSection(),
    ],
  },

  "/contact": {
    label: "Customer care",
    title: "Contact Us",
    metaTitle: "Contact Us",
    description: `Contact ${business.tradingName} customer care in Dubai.`,
    intro: (
      <p>
        {" "}
        <CustomerCopy>
          Questions about an order, a custom cake or delivery? Our team is here
          to help.
        </CustomerCopy>{" "}
      </p>
    ),
    sections: [
      {
        id: "contact-channels",
        title: "Customer care",
        body: <ContactDetails contactPage />,
      },
      {
        id: "order-help",
        title: "Help with an existing order",
        body: (
          <p>
            {" "}
            <CustomerCopy>
              Please include your order reference and the name on the order. To
              cancel, change or report a problem with an order, see our
            </CustomerCopy>{" "}
            <L to="/refund-policy">
              {" "}
              <CustomerCopy>Refund &amp; Cancellation Policy</CustomerCopy>{" "}
            </L>
            .
          </p>
        ),
      },
      {
        id: "how-to-order",
        title: "How to order",
        body: (
          <>
            {orderingSteps}
            <OrderAcknowledgement />
          </>
        ),
      },
      {
        id: "delivery",
        title: "Delivery area",
        body: (
          <p>
            {" "}
            <CustomerCopy>We deliver across Dubai. See our</CustomerCopy>{" "}
            <L to="/delivery-policy">
              {" "}
              <CustomerCopy>Delivery Policy</CustomerCopy>{" "}
            </L>{" "}
            <CustomerCopy>
              for the areas we cover, minimum order values and delivery charges.
            </CustomerCopy>{" "}
          </p>
        ),
      },
    ],
  },
};

export function PolicyPage({ path }: { path: PolicyPath }) {
  const { text: localize } = useCustomerLanguage();

  const page = pages[path];
  useEffect(() => {
    document.title = `${localize(page.metaTitle)} — ${business.tradingName} Dubai`;
  }, [page, localize]);
  const toContact = () => {
    if (path === "/contact")
      document.getElementById("contact-channels")?.scrollIntoView();
    else location.assign("/contact");
  };
  return (
    <div className="brand-experience b-entered b-policy-page">
      <a className="b-skip" href="#main-content">
        {" "}
        <CustomerCopy>Skip to content</CustomerCopy>{" "}
      </a>
      <SiteHeader onContactUnavailable={toContact} />
      <main id="main-content" className="b-policy">
        <header className="b-policy-hero">
          <StarMotif />
          <SectionLabel>{page.label}</SectionLabel>
          <h1>
            <CustomerCopy>{page.title}</CustomerCopy>
          </h1>
          <div className="b-policy-intro">{page.intro}</div>
          {path !== "/contact" && (
            <p className="b-caption">
              {" "}
              <CustomerCopy>Last updated</CustomerCopy>{" "}
              {business.policiesUpdated} · {legalEntityLabel()}
            </p>
          )}
        </header>
        {page.summary && (
          <ul className="b-policy-summary" aria-label={localize("Summary")}>
            {page.summary.map((s) => (
              <li key={s.title}>
                <p className="b-label">
                  <CustomerCopy>{s.title}</CustomerCopy>
                </p>
                <p>
                  {typeof s.text === "string" ? (
                    <CustomerCopy>{s.text}</CustomerCopy>
                  ) : (
                    s.text
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
        <div className="b-policy-body">
          {page.sections.length > 4 && (
            <nav className="b-policy-toc" aria-label={localize("On this page")}>
              <p className="b-label">
                {" "}
                <CustomerCopy>On this page</CustomerCopy>{" "}
              </p>
              <ol>
                {page.sections.map((s) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`}>
                      {localize(s.title).replace(/^\d+\.\s*/, "")}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          )}
          <article>
            {page.sections.map((s) => (
              <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`}>
                <h2 id={`${s.id}-h`}>
                  <CustomerCopy>{s.title}</CustomerCopy>
                </h2>
                {s.body}
              </section>
            ))}
          </article>
        </div>
        <nav
          className="b-policy-related"
          aria-label={localize("Customer policies")}
        >
          {policyRoutes
            .filter((r) => r.path !== path)
            .map((r) => (
              <a key={r.path} href={r.path}>
                <CustomerCopy>{r.label}</CustomerCopy>
                <ArrowUpRight aria-hidden />
              </a>
            ))}
        </nav>
      </main>
      <SiteFooter onContactUnavailable={toContact} />
    </div>
  );
}
