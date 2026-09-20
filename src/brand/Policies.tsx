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

function ContactDetails() {
  const channels = contactChannels();
  return (
    <>
      {channels.length > 0 && (
        <ul className="b-policy-channels">
          {channels.map((c) => (
            <li key={c.kind}>
              <span className="b-label">{c.label}</span>
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
          <dt>Business</dt>
          <dd>{legalEntityLabel()}</dd>
        </div>
        {business.tradeLicence && (
          <div>
            <dt>Trade licence</dt>
            <dd>{business.tradeLicence}</dd>
          </div>
        )}
        <div>
          <dt>{business.address ? "Address" : "Location"}</dt>
          <dd>{business.address ?? `${business.city}, ${business.country}`}</dd>
        </div>
        {business.supportHours && (
          <div>
            <dt>Customer care hours</dt>
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
        Questions about this policy or an order can be sent to our customer care
        team. Please include your order reference where you have one.
      </p>
      <ContactDetails />
    </>
  ),
});

const orderingSteps = (
  <ol>
    <li>
      Message us on WhatsApp with what you would like. Our team confirms the
      items, availability and prices in AED.
    </li>
    <li>
      Share your delivery location — ideally a WhatsApp location pin — so we can
      confirm the delivery area and its minimum order value.
    </li>
    <li>
      We send you a secure payment link showing the total amount, including any
      delivery charge.
    </li>
    <li>
      Pay by Visa or Mastercard on the secure page hosted by our payment
      provider, {business.paymentProcessor}. Your order is confirmed once the
      payment has been verified.
    </li>
    <li>
      We prepare your order and deliver it at the date and time agreed with you.
    </li>
  </ol>
);

function DeliveryAreas() {
  return (
    <div className="b-policy-zones">
      <article>
        <p className="b-label">
          Free delivery · Minimum AED {freeDeliveryAreas.minOrderAed}
        </p>
        <ul>
          {freeDeliveryAreas.areas.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </article>
      {deliveryBands.map((band) => (
        <article key={band.minOrderAed}>
          <p className="b-label">Minimum order AED {band.minOrderAed}</p>
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
        These terms apply when you use this website or order from{" "}
        <strong>{legalEntityLabel()}</strong>. Please read them before placing
        an order.
      </p>
    ),
    sections: [
      {
        id: "about",
        title: "1. Who we are",
        body: (
          <>
            <p>
              This website and our ordering service are operated by{" "}
              <strong>{legalEntityLabel()}</strong>, based in {business.city},{" "}
              {business.country}
              {business.tradeLicence
                ? ` (trade licence ${business.tradeLicence})`
                : ""}
              .{business.address ? ` Our address is ${business.address}.` : ""}
            </p>
            <p>
              In these terms, “we”, “us”, “our” and “3L” mean {who()}. “You”
              means the person placing the order or using this website.
            </p>
          </>
        ),
      },
      {
        id: "acceptance",
        title: "2. Accepting these terms",
        body: (
          <p>
            By using this website or placing an order with us, you agree to
            these Terms &amp; Conditions together with our{" "}
            <L to="/refund-policy">Refund &amp; Cancellation Policy</L>,{" "}
            <L to="/delivery-policy">Delivery Policy</L> and{" "}
            <L to="/privacy">Privacy Policy</L>, which form part of these terms.
            If you do not agree, please do not place an order.
          </p>
        ),
      },
      {
        id: "products",
        title: "3. Our products",
        body: (
          <>
            <p>
              We make Tres Leches cakes, cake jars, bakery items and custom
              cakes. Products are freshly prepared and perishable. Because they
              are handmade, colours, decoration and finish may vary slightly
              from photographs, which are for illustration only.
            </p>
            <p>
              Custom cakes are made to the details you confirm with our team
              (size, flavour, design and any text). Please check these details
              carefully before paying. By sending us images or text for a custom
              design, you confirm that you are entitled to use them.
            </p>
            <p>
              Our products are made with ingredients such as milk, eggs and
              wheat flour. If you or anyone eating the product has an allergy or
              dietary requirement, tell us before you order so our team can
              advise you. We cannot guarantee that any product is free from
              allergens.
            </p>
          </>
        ),
      },
      {
        id: "ordering",
        title: "4. How ordering works",
        body: (
          <>
            <p>Orders are placed with our team through WhatsApp:</p>
            {orderingSteps}
          </>
        ),
      },
      {
        id: "pricing",
        title: "5. Prices",
        body: (
          <p>
            Prices are in UAE dirhams (AED). The total you pay — products plus
            any delivery charge — is shown on your payment link before you pay.
            Each delivery area has a minimum order value, set out in our{" "}
            <L to="/delivery-policy">Delivery Policy</L>. If a price shown to
            you is clearly wrong, we will contact you before taking payment.
          </p>
        ),
      },
      {
        id: "payment",
        title: "6. Payment",
        body: (
          <>
            <p>
              Orders are paid in full, in advance, by Visa or Mastercard through
              a secure payment page hosted by our payment provider,{" "}
              {business.paymentProcessor}. Your card details are entered
              directly on that page; {business.tradingName} does not receive or
              store your full card number or security code.
            </p>
            <p>
              Payment links are valid for a limited time. If a link expires
              before you pay, nothing is charged and our team can send you a new
              one.
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
              Your order is accepted and confirmed only once your payment has
              been verified with our payment provider. Reaching the payment
              page, or being redirected after it, does not by itself confirm an
              order.
            </p>
            <p>
              We may decline an order before payment — for example if the
              delivery address is outside our delivery area, the order is below
              the area’s minimum value, or a product is unavailable. If, after
              payment, we cannot fulfil all or part of your order, we will
              contact you and refund the amount paid for anything we cannot
              supply.
            </p>
          </>
        ),
      },
      {
        id: "your-information",
        title: "8. Your responsibilities",
        body: (
          <p>
            You are responsible for giving us accurate and complete information:
            your name and mobile number, the recipient’s details, the exact
            delivery location and access instructions, the details of any custom
            design, and any allergy information. Problems caused by incorrect or
            incomplete information are handled under our{" "}
            <L to="/delivery-policy">Delivery Policy</L> and{" "}
            <L to="/refund-policy">Refund &amp; Cancellation Policy</L>.
          </p>
        ),
      },
      {
        id: "delivery",
        title: "9. Delivery",
        body: (
          <p>
            We deliver within the Dubai areas listed in our{" "}
            <L to="/delivery-policy">Delivery Policy</L>, which explains
            delivery areas, minimum order values, charges, scheduling and what
            happens if a delivery cannot be completed.
          </p>
        ),
      },
      {
        id: "cancellation",
        title: "10. Cancellations and refunds",
        body: (
          <p>
            You can cancel an order at no cost before you pay. Once payment is
            verified your order is confirmed, and cancellation or refund
            requests are reviewed by our team as described in our{" "}
            <L to="/refund-policy">Refund &amp; Cancellation Policy</L>.
          </p>
        ),
      },
      {
        id: "website",
        title: "11. Using this website",
        body: (
          <p>
            You may use this website to learn about our products and to contact
            us. You must not misuse it, interfere with its operation, attempt to
            access areas that are not intended for customers, or copy our name,
            logos, photographs or content for commercial use without our written
            permission. The staff operations area is for authorised{" "}
            {business.tradingName} team members only.
          </p>
        ),
      },
      {
        id: "liability",
        title: "12. Our responsibility to you",
        body: (
          <>
            <p>
              We take care to prepare and deliver your order as agreed. To the
              extent permitted by the laws of the United Arab Emirates, we are
              not responsible for losses that were not reasonably foreseeable,
              for delays or failures caused by events outside our reasonable
              control, or for products that are stored or handled incorrectly
              after delivery. Where we are responsible, our liability is limited
              to the amount you paid for the affected order.
            </p>
            <p>
              Nothing in these terms limits any rights you have under applicable
              UAE consumer protection law.
            </p>
          </>
        ),
      },
      {
        id: "changes",
        title: "13. Changes to these terms",
        body: (
          <p>
            We may update these terms from time to time. The version published
            on this page when you pay for your order applies to that order.
          </p>
        ),
      },
      {
        id: "law",
        title: "14. Governing law",
        body: (
          <p>
            These terms are governed by the laws of the United Arab Emirates as
            applied in the Emirate of Dubai.
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
        This policy explains what information {legalEntityLabel()} collects when
        you visit this website or order from us, how we use it, and the choices
        you have.
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
            {legalEntityLabel()}, based in {business.city}, {business.country},
            is responsible for the personal information described in this
            policy. You can reach us using the details at the end of this page.
          </p>
        ),
      },
      {
        id: "collect",
        title: "2. Information we collect",
        body: (
          <>
            <h3>When you message us on WhatsApp</h3>
            <p>
              Your mobile number, WhatsApp profile name, the messages you send
              us, and any location pin you share.
            </p>
            <h3>When you place an order</h3>
            <p>
              The products you order and their prices, your delivery address or
              location, the delivery area it falls in, recipient name and phone
              number if different from yours, access instructions, and notes you
              give us — such as a cake message, design details or allergy
              information. We also keep a record of each order’s status (for
              example, confirmed, out for delivery, delivered).
            </p>
            <h3>When you pay</h3>
            <p>
              You enter your card details on a secure page hosted by{" "}
              {business.paymentProcessor}. We do not receive or store your full
              card number or security code. We receive the payment result from{" "}
              {business.paymentProcessor} — status, amount, currency and a
              transaction reference — so we can confirm your order and handle
              any refund.
            </p>
            <h3>When you visit this website</h3>
            <p>
              You do not need an account to browse. The website does not use
              analytics, advertising or tracking cookies. It uses your browser’s
              session storage only to remember that you have already seen the
              opening animation. Like any website, our hosting provider
              processes technical information such as your IP address and
              browser type to deliver and secure the site.
            </p>
          </>
        ),
      },
      {
        id: "use",
        title: "3. How we use your information",
        body: (
          <ul>
            <li>To reply to your enquiries and take your order.</li>
            <li>
              To confirm your delivery area, its minimum order value and any
              delivery charge.
            </li>
            <li>
              To create your payment link, verify your payment and process
              approved refunds.
            </li>
            <li>To prepare and deliver your order and keep you updated.</li>
            <li>To handle questions, complaints and refund requests.</li>
            <li>
              To keep our systems secure, prevent fraud and meet our legal, tax
              and accounting obligations.
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
              We do not sell your personal information. We share it only with
              providers that help us run our service, and only as needed for
              their role:
            </p>
            <ul>
              <li>
                <strong>{business.paymentProcessor}</strong> — processes card
                payments and refunds on our behalf.
              </li>
              <li>
                <strong>Meta (WhatsApp Business)</strong> — carries the messages
                you exchange with us on WhatsApp.
              </li>
              <li>
                <strong>Mapbox</strong> — where enabled, converts a shared
                location into an address so we can identify your delivery area.
              </li>
              <li>
                <strong>OpenAI</strong> — where enabled, provides AI tools that
                help our team prepare replies to customer messages. Our team
                remains responsible for orders, payments, refunds and
                cancellations.
              </li>
              <li>
                <strong>Cloud hosting provider</strong> — hosts this website and
                our order system.
              </li>
              <li>
                <strong>Delivery staff</strong> — receive the recipient details
                and location needed to deliver your order.
              </li>
            </ul>
            <p>
              Some of these providers may process information outside the UAE.
              We may also disclose information where required by law or by a
              competent authority.
            </p>
          </>
        ),
      },
      {
        id: "marketing",
        title: "5. Marketing",
        body: (
          <p>
            We only send you marketing messages if you have agreed to receive
            them, and you can opt out at any time. Our newsletter sign-up is not
            active yet, so we do not currently collect email addresses through
            this website.
          </p>
        ),
      },
      {
        id: "retention",
        title: "6. How long we keep information",
        body: (
          <p>
            We keep order, payment and conversation records only for as long as
            they are needed for the purposes above, including resolving
            questions about an order and meeting legal, tax and accounting
            record-keeping requirements.
          </p>
        ),
      },
      {
        id: "security",
        title: "7. Security",
        body: (
          <p>
            This website is served over an encrypted (HTTPS) connection. Our
            order system can only be accessed by authorised team members with
            individual accounts and role-based permissions. Card payments are
            handled entirely on our payment provider’s secure page.
          </p>
        ),
      },
      {
        id: "rights",
        title: "8. Your choices and rights",
        body: (
          <p>
            Subject to applicable UAE data protection law, you can ask us for a
            copy of the personal information we hold about you, ask us to
            correct it, ask us to delete it where we are not required to keep
            it, or object to marketing. Contact us using the details below and
            we will respond to your request.
          </p>
        ),
      },
      {
        id: "changes",
        title: "9. Changes to this policy",
        body: (
          <p>
            We may update this policy from time to time. The date at the top of
            this page shows when it was last updated.
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
        Our cakes are freshly prepared, perishable food. This policy explains
        when an order can be cancelled, when a refund is possible, and how to
        ask for one.
      </p>
    ),
    summary: [
      {
        title: "Before payment",
        text: "Cancel or change your order at any time, free of charge. Nothing is charged until you complete payment.",
      },
      {
        title: "After payment",
        text: decide.paidCancellationWindow
          ? `Your order is confirmed. You can request a cancellation ${decide.paidCancellationWindow}.`
          : "Your order is confirmed and cannot be cancelled automatically. Contact us straight away — our team reviews every request.",
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
            An order is not confirmed until payment has been verified. Before
            you pay, you can cancel or change your order at any time by telling
            us on WhatsApp — or simply by not completing the payment. Nothing is
            charged. Payment links expire after a limited time; an expired link
            cannot be used to take payment.
          </p>
        ),
      },
      {
        id: "after-payment",
        title: "2. Cancelling after payment",
        body: (
          <>
            <p>
              Once your payment is verified, your order is confirmed and
              scheduled for preparation. Paid orders cannot be cancelled or
              changed automatically. Please contact us as soon as possible if
              you need to cancel.
            </p>
            {decide.paidCancellationWindow ? (
              <p>
                You can cancel a paid order {decide.paidCancellationWindow}.
                {decide.paidCancellationRefund
                  ? ` Approved cancellations within this period receive ${decide.paidCancellationRefund}.`
                  : ""}
              </p>
            ) : (
              <p>
                Our team reviews each cancellation request individually, taking
                into account whether preparation of your order has started.
                Because our products are freshly made to order and perishable —
                and custom cakes are made to your specific design — we may be
                unable to cancel an order once preparation has begun.
              </p>
            )}
            <p>
              If we approve a cancellation, we will confirm the refund amount to
              you in writing before processing it.
            </p>
          </>
        ),
      },
      {
        id: "changes",
        title: "3. Changing a paid order",
        body: (
          <p>
            To change the items, date, time or delivery address of a paid order,
            contact us as soon as possible. We will tell you whether the change
            is possible. A new address may fall in a delivery area with a
            different minimum order value or delivery charge.
          </p>
        ),
      },
      {
        id: "issues",
        title: "4. Damaged, incorrect or missing items",
        body: (
          <>
            <p>
              Please check your order when it arrives. If anything is damaged,
              incorrect or missing, contact us{" "}
              {decide.issueReportWindow ??
                "as soon as possible, ideally on the day of delivery"}
              , and include:
            </p>
            <ul>
              <li>your order reference;</li>
              <li>
                clear photos of the product and its packaging as received;
              </li>
              <li>a short description of the problem.</li>
            </ul>
            <p>
              Please keep the product and packaging until we have reviewed your
              report. Where we confirm that an item was damaged, incorrect or
              missing because of an error on our side, we will offer a
              replacement or a refund for the affected items, in line with
              applicable UAE consumer protection law.
            </p>
          </>
        ),
      },
      {
        id: "limitations",
        title: "5. When a refund may not be possible",
        body: (
          <>
            <p>We may decline a refund request where:</p>
            <ul>
              <li>
                preparation had already started when a change-of-mind
                cancellation was requested;
              </li>
              <li>
                a delivery could not be completed because of incorrect delivery
                details or because the recipient was unavailable (see our{" "}
                <L to="/delivery-policy">Delivery Policy</L>);
              </li>
              <li>
                the product was stored or handled incorrectly after delivery;
              </li>
              <li>
                the concern relates only to the natural variation of a handmade
                product, or to design details that were confirmed before
                payment;
              </li>
              <li>
                the issue is reported without the information needed to review
                it.
              </li>
            </ul>
            <p>
              Because our products are perishable food, delivered items cannot
              be returned to us for resale. This does not affect your rights
              under applicable UAE consumer protection law.
            </p>
          </>
        ),
      },
      {
        id: "how-to-request",
        title: "6. How to request a cancellation or refund",
        body: (
          <ol>
            <li>
              Contact our customer care team using the details below — WhatsApp
              is the fastest way to reach us.
            </li>
            <li>
              Give your order reference, the name on the order and the reason
              for your request, with photos if the order has a problem.
            </li>
            <li>
              Our team reviews the request, may ask you for more information,
              and tells you the outcome.
            </li>
            <li>
              If a refund is approved, we process it and confirm to you once it
              has been issued.
            </li>
          </ol>
        ),
      },
      {
        id: "refund-method",
        title: "7. How refunds are paid",
        body: (
          <p>
            Approved refunds are made to the original Visa or Mastercard card
            used for payment, through our payment provider,{" "}
            {business.paymentProcessor}. We cannot refund to a different card or
            account. Once we have issued the refund, the time it takes to appear
            on your statement depends on your card issuer.
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
        We deliver freshly prepared cakes, cake jars and bakery items across
        Dubai. This policy explains where we deliver, minimum order values,
        charges, scheduling and what happens if a delivery cannot be completed.
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
        text: `Free in ${freeDeliveryAreas.areas.join(", ")}. Elsewhere, any charge is included in the total on your payment link before you pay.`,
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
              We deliver only within Dubai, to the communities listed below.
              Each area has a minimum order value (products only). If your area
              is not listed, please ask us before ordering. We do not take
              payment for an address outside our delivery area, below its
              minimum order value, or whose area we cannot confirm.
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
            Delivery is free to {freeDeliveryAreas.areas.join(", ")}. For other
            areas, our team confirms any delivery charge when you order. It is
            always included in the total shown on your payment link, so you see
            the full amount before paying.
          </p>
        ),
      },
      {
        id: "scheduling",
        title: "3. Scheduling your delivery",
        body: (
          <>
            <p>
              The delivery date and time are agreed with our team on WhatsApp
              when you place your order, and are confirmed once your payment has
              been verified.
              {decide.deliveryHours
                ? ` We deliver ${decide.deliveryHours}.`
                : ""}
              {decide.orderLeadTime
                ? ` Please order at least ${decide.orderLeadTime}.`
                : " Please order early for custom cakes and busy dates, as availability is limited."}
            </p>
            <p>
              After payment, your order moves through preparation, ready and out
              for delivery. Our team can update you on WhatsApp.
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
              You are responsible for giving us accurate and complete delivery
              information:
            </p>
            <ul>
              <li>
                the exact location — a WhatsApp location pin is best, as it is
                how we confirm your delivery area;
              </li>
              <li>
                the full address, including building or villa, apartment number
                and community;
              </li>
              <li>the recipient’s name and a reachable mobile number;</li>
              <li>
                any access instructions, such as gate codes, concierge or
                parking details.
              </li>
            </ul>
            <p>
              If you need to change delivery details after paying, tell us as
              soon as possible. A new address may be in a delivery area with a
              different minimum order value or charge.
            </p>
          </>
        ),
      },
      {
        id: "receiving",
        title: "5. Receiving your order",
        body: (
          <p>
            Please make sure someone is available to receive the order at the
            agreed time. Our cakes are fresh, milk-soaked products: check the
            order on arrival, keep cakes level, and refrigerate them promptly.
          </p>
        ),
      },
      {
        id: "delays",
        title: "6. Delays",
        body: (
          <p>
            We aim to deliver at the agreed time. Traffic, weather, building
            access or security checks, and very busy dates can cause delays
            outside our control. If we expect a significant delay, we will
            contact you.
          </p>
        ),
      },
      {
        id: "failed-delivery",
        title: "7. If a delivery cannot be completed",
        body: (
          <>
            <p>
              If our driver cannot reach the recipient, cannot access the
              location, or the delivery details are incorrect, we will try to
              contact you and the recipient by phone or WhatsApp.
            </p>
            <p>
              {decide.failedDeliveryOutcome ??
                "If the delivery still cannot be completed, our team will contact you to agree the next steps. Because our products are perishable, we cannot hold them indefinitely, and any redelivery or refund is agreed with you by our team."}{" "}
              Where a delivery fails because of incorrect details or the
              recipient being unavailable, a refund may not be possible — see
              our <L to="/refund-policy">Refund &amp; Cancellation Policy</L>.
            </p>
          </>
        ),
      },
      {
        id: "problems",
        title: "8. Problems with a delivered order",
        body: (
          <p>
            If your order arrives damaged, incorrect or incomplete, please
            follow the steps in our{" "}
            <L to="/refund-policy">Refund &amp; Cancellation Policy</L>.
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
        Questions about an order, a custom cake or delivery? Our team is here to
        help.
      </p>
    ),
    sections: [
      {
        id: "contact-channels",
        title: "Customer care",
        body: <ContactDetails />,
      },
      {
        id: "order-help",
        title: "Help with an existing order",
        body: (
          <p>
            Please include your order reference and the name on the order. To
            cancel, change or report a problem with an order, see our{" "}
            <L to="/refund-policy">Refund &amp; Cancellation Policy</L>.
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
            We deliver across Dubai. See our{" "}
            <L to="/delivery-policy">Delivery Policy</L> for the areas we cover,
            minimum order values and delivery charges.
          </p>
        ),
      },
    ],
  },
};

export function PolicyPage({ path }: { path: PolicyPath }) {
  const page = pages[path];
  useEffect(() => {
    document.title = `${page.metaTitle} — ${business.tradingName} Dubai`;
  }, [page]);
  const toContact = () => {
    if (path === "/contact")
      document.getElementById("contact-channels")?.scrollIntoView();
    else location.assign("/contact");
  };
  return (
    <div className="brand-experience b-entered b-policy-page" lang="en">
      <a className="b-skip" href="#main-content">
        Skip to content
      </a>
      <SiteHeader onContactUnavailable={toContact} />
      <main id="main-content" className="b-policy">
        <header className="b-policy-hero">
          <StarMotif />
          <SectionLabel>{page.label}</SectionLabel>
          <h1>{page.title}</h1>
          <div className="b-policy-intro">{page.intro}</div>
          {path !== "/contact" && (
            <p className="b-caption">
              Last updated {business.policiesUpdated} · {legalEntityLabel()}
            </p>
          )}
        </header>
        {page.summary && (
          <ul className="b-policy-summary" aria-label="Summary">
            {page.summary.map((s) => (
              <li key={s.title}>
                <p className="b-label">{s.title}</p>
                <p>{s.text}</p>
              </li>
            ))}
          </ul>
        )}
        <div className="b-policy-body">
          {page.sections.length > 4 && (
            <nav className="b-policy-toc" aria-label="On this page">
              <p className="b-label">On this page</p>
              <ol>
                {page.sections.map((s) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`}>{s.title.replace(/^\d+\.\s*/, "")}</a>
                  </li>
                ))}
              </ol>
            </nav>
          )}
          <article>
            {page.sections.map((s) => (
              <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`}>
                <h2 id={`${s.id}-h`}>{s.title}</h2>
                {s.body}
              </section>
            ))}
          </article>
        </div>
        <nav className="b-policy-related" aria-label="Customer policies">
          {policyRoutes
            .filter((r) => r.path !== path)
            .map((r) => (
              <a key={r.path} href={r.path}>
                {r.label}
                <ArrowUpRight aria-hidden />
              </a>
            ))}
        </nav>
      </main>
      <SiteFooter onContactUnavailable={toContact} />
    </div>
  );
}
