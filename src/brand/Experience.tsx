import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUpRight, List, Play } from "@phosphor-icons/react";
import {
  approved,
  assets,
  collections,
  occasions,
  occasionAssets,
  destinations,
  promotion,
  visibleTestimonials,
  testimonials,
  newsletterProvider,
  validateNewsletter,
  productInquiry,
  type Product,
} from "./content";
import {
  Button,
  TextLink,
  WhatsAppCTA,
  SectionLabel,
  EditorialHeading,
  Input,
  Rule,
  StarMotif,
  PatternSurface,
  SectionContainer as Section,
  ImageFrame,
  Logo,
  Modal,
} from "./primitives";
import { OrderAcknowledgement, SiteFooter } from "./SiteChrome";
import { useReveal } from "./useReveal";
import { contactChannels, legalEntityLabel, policyRoutes } from "./business";
import "./brand.css";
type DialogKind =
  | "contact"
  | "story"
  | "collection"
  | "social"
  | "faq"
  | "promotion"
  | "menu"
  | null;
const doors = [
  ["01", "CAKE JARS", "jars"],
  ["02", "CUSTOM CAKES", "custom"],
  ["03", "BAKERY", "bakery"],
  ["04", "SPECIAL OCCASIONS", "occasions"],
] as const;
function useMotion(root: React.RefObject<HTMLDivElement | null>) {
  // Entrance motion for [data-reveal] sections. Content renders visible and is
  // only hidden once useReveal can guarantee it will be shown again.
  useReveal(root);
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    // Presence tracking only: .b-in-view drives the floating order button and
    // the ticker. It never controls the visibility of content.
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) =>
          entry.target.classList.toggle("b-in-view", entry.isIntersecting),
        ),
      { threshold: 0.08 },
    );
    node
      .querySelectorAll(".b-ticker,.b-footer")
      .forEach((el) => observer.observe(el));
    const video = node.querySelector("video");
    const vObserver = new IntersectionObserver((entries) => {
      if (!video) return;
      if (entries[0]?.isIntersecting && !media.matches)
        void video.play().catch(() => {});
      else video.pause();
    });
    if (video) vObserver.observe(video);
    return () => {
      observer.disconnect();
      vObserver.disconnect();
    };
  }, [root]);
}
function ProductExperience({
  id,
  title,
  products,
  unavailable,
  cta,
}: {
  id: string;
  title: string;
  products: Product[];
  unavailable: () => void;
  cta: string;
}) {
  const [selected, setSelected] = useState(0);
  const product = products[selected]!;
  const message = productInquiry(product);
  // A selector is only meaningful once products have confirmed names. Until
  // then the section keeps its heading, artwork and ordering CTA, and simply
  // does not offer a list of unnamed items.
  const named = products.filter((p) => p.name);
  return (
    <Section id={id} className={`b-product-experience b-${id}`}>
      <div className="b-product-copy">
        <SectionLabel>
          {id === "custom" ? "THE 3L ATELIER" : "THE COLLECTION"}
        </SectionLabel>
        <EditorialHeading>{title}</EditorialHeading>
        {named.length > 0 && (
          <div className="b-product-list" aria-label={`${title} selection`}>
            {products.map((p, i) => (
              <button
                key={p.id}
                aria-pressed={selected === i}
                onFocus={() => setSelected(i)}
                onMouseEnter={() => setSelected(i)}
                onClick={() => setSelected(i)}
              >
                <span className="b-label">0{i + 1}</span>
                <span>{p.name}</span>
                <span>
                  {p.status === "out-of-stock"
                    ? "OUT OF STOCK"
                    : selected === i
                      ? "Selected"
                      : "Select"}
                </span>
              </button>
            ))}
          </div>
        )}
        {product.status === "out-of-stock" ? (
          <Button disabled>OUT OF STOCK</Button>
        ) : (
          <WhatsAppCTA
            unavailable={unavailable}
            message={
              message ??
              (id === "custom"
                ? "Hello 3L, I’d like to enquire about a custom cake."
                : "Hello 3L, could you share your current collection?")
            }
          >
            {cta}
          </WhatsAppCTA>
        )}
      </div>
      <div className="b-selected-product" aria-live="polite">
        <ImageFrame key={product.id} asset={product.image} />
        {product.name && <p className="b-caption">{product.name}</p>}
      </div>
    </Section>
  );
}
function Newsletter() {
  const [email, setEmail] = useState(""),
    [consent, setConsent] = useState(false),
    [state, setState] = useState<"idle" | "loading" | "success" | "error">(
      "idle",
    ),
    [message, setMessage] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (state === "loading") return;
    const error = validateNewsletter(email, consent);
    if (error) {
      setMessage(error);
      setState("error");
      return;
    }
    setState("loading");
    setMessage("Submitting…");
    request.current = new AbortController();
    try {
      await newsletterProvider.subscribe(
        { email: email.trim(), consent },
        request.current.signal,
      );
      setState("success");
      setMessage("Thank you. Your subscription is confirmed.");
    } catch (e) {
      if (request.current.signal.aborted) return;
      setState("error");
      setMessage(
        e instanceof Error
          ? e.message
          : "Unable to subscribe. Please try again.",
      );
    }
  }
  return (
    <Section id="newsletter" className="b-newsletter">
      <StarMotif />
      <EditorialHeading>SWEET NEWS AHEAD.</EditorialHeading>
      <p>{approved.newsletter}</p>
      <form onSubmit={(e) => void submit(e)} noValidate>
        <label htmlFor="b-email">Your email here</label>
        <div className="b-email-row">
          <Input
            id="b-email"
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-describedby="b-news-message"
            aria-invalid={
              state === "error" && !validateNewsletter(email, true)
                ? undefined
                : state === "error"
            }
          />
          <Button type="submit" disabled={state === "loading"}>
            {state === "loading" ? "SUBMITTING…" : "SUBSCRIBE"}
            <ArrowUpRight aria-hidden />
          </Button>
        </div>
        <label className="b-consent">
          <Input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>{approved.consent}</span>
        </label>
        <p id="b-news-message" role="status" className="b-form-status">
          {message}
        </p>
      </form>
    </Section>
  );
}
/** Only a fully approved offer (copy, CTA and artwork) may render publicly. */
const promotionReady = Boolean(
  promotion.enabled &&
  promotion.message &&
  promotion.cta &&
  assets.promotion.src,
);

export function BrandExperience({ onManage }: { onManage: () => void }) {
  const voices = visibleTestimonials(testimonials);
  const root = useRef<HTMLDivElement>(null);
  useMotion(root);
  const [dialog, setDialog] = useState<DialogKind>(null),
    [selectedDoor, setSelectedDoor] = useState<string>("jars"),
    [occasion, setOccasion] = useState(0),
    [scrolled, setScrolled] = useState(false),
    [videoFailed, setVideoFailed] = useState(false);
  useEffect(() => {
    // The 3s intro splash was removed in TL-30: the site loads in well under
    // half a second, so the splash only deferred LCP and the WhatsApp CTA.
    const scroll = () => setScrolled(window.scrollY > 48);
    scroll();
    window.addEventListener("scroll", scroll, { passive: true });
    return () => window.removeEventListener("scroll", scroll);
  }, []);
  useEffect(() => {
    if (
      !promotion.enabled ||
      !promotion.message ||
      !promotion.cta ||
      !assets.promotion.src
    )
      return;
    const target = document.getElementById("promotion");
    if (!target) return;
    const io = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting) return;
      try {
        if (sessionStorage.getItem("3l-promotion")) return;
        sessionStorage.setItem("3l-promotion", "1");
      } catch {
        return;
      }
      setDialog("promotion");
      io.disconnect();
    });
    io.observe(target);
    return () => io.disconnect();
  }, []);
  const contact = () => setDialog("contact");
  const navigation = (
    <>
      <a href="#story" onClick={() => setDialog(null)}>
        OUR STORY
      </a>
      <a href="#collection" onClick={() => setDialog(null)}>
        MENU
      </a>
      <a href="#community" onClick={() => setDialog(null)}>
        JOURNAL
      </a>
      <a href="#dubai" onClick={() => setDialog(null)}>
        CONTACT
      </a>
    </>
  );
  const close = () => setDialog(null);
  return (
    <div ref={root} className="brand-experience b-entered" lang="en">
      <a className="b-skip" href="#main-content">
        Skip to content
      </a>
      <header className={`b-header ${scrolled ? "b-scrolled" : ""}`}>
        <nav className="b-nav-left" aria-label="Primary">
          <a href="#story">OUR STORY</a>
          <a href="#collection">MENU</a>
        </nav>
        <button
          className="b-menu"
          aria-label="Open menu"
          aria-haspopup="dialog"
          onClick={() => setDialog("menu")}
        >
          <List aria-hidden />
        </button>
        <a href="#home" className="b-home" aria-label="3L home">
          <Logo />
        </a>
        <nav className="b-nav-right" aria-label="Contact">
          <a href="#community">JOURNAL</a>
          <a href="#dubai">CONTACT</a>
          <WhatsAppCTA unavailable={contact} />
        </nav>
        <WhatsAppCTA className="b-mobile-wa" unavailable={contact}>
          ORDER
        </WhatsAppCTA>
      </header>
      <main id="main-content">
        <section id="home" className="b-hero" aria-label="3L Dubai">
          <div className="b-hero-media">
            {assets.hero.src && assets.poster.src && !videoFailed ? (
              <video
                muted
                loop
                playsInline
                poster={assets.poster.src}
                preload="metadata"
                onError={() => setVideoFailed(true)}
                aria-label="Tres Leches soaking film"
              >
                <source src={assets.hero.src} type="video/mp4" />
              </video>
            ) : assets.poster.src ? (
              <img
                className="b-hero-poster"
                src={assets.poster.src}
                alt={assets.poster.alt}
                /* Above the fold and the LCP candidate once the asset lands:
                   never lazy, and hinted ahead of the rest of the page. */
                loading="eager"
                fetchPriority="high"
                decoding="async"
              />
            ) : (
              /* Brand-system hero panel shown until the approved film or
                 photography is supplied. Pure CSS, no network request, and
                 purely decorative — the headline and CTAs above carry all
                 meaning. Dropping a real asset into assets.hero/assets.poster
                 replaces this without touching the hero layout. */
              <div className="b-hero-canvas" aria-hidden="true" />
            )}
          </div>
          <div className="b-hero-copy">
            <SectionLabel>MEXICO CITY / SINCE 1982</SectionLabel>
            <h1>
              <span>SOAKED IN</span>
              <span>TRADITION.</span>
            </h1>
            <p>{approved.hero}</p>
            <button className="b-story-link" onClick={() => setDialog("story")}>
              <Play aria-hidden />
              WATCH OUR STORY
            </button>
          </div>
          <div className="b-hero-note">
            <p>{approved.micro}</p>
            <a href="#bridge" aria-label="Explore the 3L story">
              <ArrowDown aria-hidden />
            </a>
          </div>
        </section>
        <Section id="bridge" className="b-bridge">
          <StarMotif />
          <EditorialHeading>
            MORE THAN A CAKE.
            <br />
            <span>A FAMILY TRADITION.</span>
          </EditorialHeading>
          <Rule />
        </Section>
        <Section id="collection" className="b-collection">
          <SectionLabel>THE FEATURED COLLECTION</SectionLabel>
          <div className="b-featured" data-reveal-group>
            {collections.featured.map((p) => (
              /* Without a confirmed product name the tile stays purely
                 visual — a brand panel under the section heading — rather
                 than announcing that data is missing. */
              <article key={p.id}>
                <ImageFrame asset={p.image} />
                {p.name && <h3>{p.name}</h3>}
              </article>
            ))}
          </div>
          <Button onClick={() => setDialog("collection")}>
            VIEW ALL CAKES
            <ArrowUpRight aria-hidden />
          </Button>
        </Section>
        <Section id="tradition" className="b-tradition">
          <PatternSurface>
            <div className="b-tradition-panel">
              <SectionLabel>PASTELERÍAS 3L</SectionLabel>
              <EditorialHeading>
                TRADITION
                <br />
                IN EVERY
                <br />
                SLICE.
              </EditorialHeading>
              <TextLink href="#collection">VIEW THE COLLECTION</TextLink>
            </div>
            <ImageFrame asset={assets.slices} className="b-slices" />
          </PatternSurface>
        </Section>
        <Section id="story" className="b-family">
          <div className="b-family-images">
            <ImageFrame asset={assets.alicia} />
            <ImageFrame asset={assets.family} />
          </div>
          <div>
            <SectionLabel>THE 3L STORY</SectionLabel>
            <EditorialHeading>
              CRAFTED
              <br />
              WITH LOVE.
              <br />A FAMILY LEGACY.
            </EditorialHeading>
            {/* No approved story paragraph yet. The heading and the
                DISCOVER OUR STORY action carry the section on their own;
                marketing copy is not written here. */}
            <Button
              className="b-text-button"
              onClick={() => setDialog("story")}
            >
              DISCOVER OUR STORY
              <ArrowUpRight aria-hidden />
            </Button>
            <p className="b-handwritten">Same passion, new destinations.</p>
          </div>
        </Section>
        <div className="b-ticker" aria-hidden="true">
          <div>
            {Array.from({ length: 12 }, (_, i) => (
              <StarMotif key={i} />
            ))}
          </div>
        </div>
        <Section id="discovery" className="b-discovery">
          <SectionLabel>THE WORLD OF 3L</SectionLabel>
          <EditorialHeading>
            THERE’S MORE
            <br />
            TO DISCOVER.
          </EditorialHeading>
          <div className="b-doors" data-reveal-group>
            {doors.map(([number, name, id]) => (
              <a
                key={id}
                className={`b-door b-door-${id} ${selectedDoor === id ? "b-selected" : ""}`}
                href={`#${id}`}
                onMouseEnter={() => setSelectedDoor(id)}
                onFocus={() => setSelectedDoor(id)}
                onClick={() => setSelectedDoor(id)}
              >
                <span className="b-door-number">
                  {number}
                  <ArrowUpRight aria-hidden />
                </span>
                <div>
                  <StarMotif />
                  <h3>{name}</h3>
                </div>
                <span className="b-caption">EXPLORE THE COLLECTION</span>
              </a>
            ))}
          </div>
        </Section>
        <ProductExperience
          id="bakery"
          title="BAKERY"
          products={collections.bakery}
          unavailable={contact}
          cta="EXPLORE BAKERY"
        />
        <ProductExperience
          id="jars"
          title="CAKE JARS"
          products={collections.jars}
          unavailable={contact}
          cta="ORDER THIS JAR"
        />
        <ProductExperience
          id="custom"
          title="CUSTOM CAKES"
          products={collections.custom}
          unavailable={contact}
          cta="REQUEST A CUSTOM CAKE"
        />
        <Section id="occasions" className="b-occasions">
          <div>
            <SectionLabel>MOMENTS TO REMEMBER</SectionLabel>
            <EditorialHeading>
              SPECIAL
              <br />
              OCCASIONS
            </EditorialHeading>
            <p>Cakes for life’s most meaningful moments, big and small.</p>
          </div>
          <div className="b-occasion-layout">
            <div className="b-occasion-tabs" aria-label="Occasion category">
              {occasions.map((name, i) => (
                <button
                  key={name}
                  aria-pressed={occasion === i}
                  onClick={() => setOccasion(i)}
                >
                  {name}
                  <ArrowUpRight aria-hidden />
                </button>
              ))}
            </div>
            <div aria-live="polite">
              <ImageFrame key={occasion} asset={occasionAssets[occasion]!} />
              <p className="b-caption">{occasions[occasion]}</p>
            </div>
          </div>
          <WhatsAppCTA
            unavailable={contact}
            message={`Hello 3L, I’d like to enquire about a cake for ${occasions[occasion]!.toLowerCase()}.`}
          >
            REQUEST A CAKE
          </WhatsAppCTA>
        </Section>
        {/* Only verified, permissioned customer quotes appear here. With none
            approved the section is omitted rather than shown as empty slots. */}
        {voices.length > 0 && (
          <Section id="voices" className="b-voices">
            <SectionLabel>FROM YOUR MOMENTS</SectionLabel>
            <EditorialHeading>
              A LITTLE
              <br />
              SWEETNESS, SHARED.
            </EditorialHeading>
            <div className="b-voice-universe">
              {voices.map((t) => (
                <blockquote key={t.id}>
                  <p>{t.text}</p>
                  <cite>{t.source}</cite>
                </blockquote>
              ))}
            </div>
          </Section>
        )}
        <Section id="community" className="b-community">
          <SectionLabel>@3L.DUBAI</SectionLabel>
          <EditorialHeading>MORE THAN A CAKE.</EditorialHeading>
          <p>A community that makes everything sweeter.</p>
          <ImageFrame asset={assets.social} />
          {destinations.instagram ? (
            <TextLink href={destinations.instagram}>
              FOLLOW OUR JOURNEY
            </TextLink>
          ) : (
            <WhatsAppCTA unavailable={contact}>SAY HELLO</WhatsAppCTA>
          )}
        </Section>
        {/* The promotion block renders only when a real, approved offer
            exists. With nothing approved it is omitted entirely rather than
            shown as an empty teaser — we do not advertise a non-offer. */}
        {promotionReady && (
          <section
            id="promotion"
            className="b-promotion-slot"
            aria-label="Promotional discovery"
          >
            <span className="b-caption">{promotion.message}</span>
            <button
              className="b-text-button"
              onClick={() => setDialog("promotion")}
            >
              Discover more
              <ArrowUpRight aria-hidden />
            </button>
          </section>
        )}
        <Section id="dubai" className="b-dubai">
          <div>
            <SectionLabel>MEXICO CITY → DUBAI</SectionLabel>
            <EditorialHeading>DUBAI</EditorialHeading>
            <h3>
              Same sweetness,
              <br />
              closer to you.
            </h3>
            <p>{approved.dubai}</p>
            <WhatsAppCTA unavailable={contact}>ORDER NOW</WhatsAppCTA>
            <OrderAcknowledgement />
          </div>
          <ImageFrame asset={assets.dubai} />
        </Section>
        <Newsletter />
      </main>
      <SiteFooter
        onContactUnavailable={contact}
        onFaq={() => setDialog("faq")}
        onSocial={
          destinations.instagram || destinations.tiktok
            ? () => setDialog("social")
            : undefined
        }
        onManage={onManage}
      />
      <WhatsAppCTA
        className="b-floating-order"
        ariaLabel="Order on WhatsApp"
        unavailable={contact}
      >
        ORDER
      </WhatsAppCTA>
      {dialog && (
        <Modal
          title={
            dialog === "menu"
              ? "EXPLORE 3L"
              : dialog === "contact"
                ? "ORDER WITH 3L"
                : dialog === "story"
                  ? "THE 3L STORY"
                  : dialog === "collection"
                    ? "THE CAKE COLLECTION"
                    : dialog === "social"
                      ? "FOLLOW OUR JOURNEY"
                      : dialog === "faq"
                        ? "YOUR QUESTIONS"
                        : "A LITTLE DISCOVERY"
          }
          onClose={close}
        >
          {dialog === "menu" ? (
            <nav className="b-modal-nav" aria-label="Mobile navigation">
              {navigation}
              <button onClick={contact}>ORDER ON WHATSAPP</button>
              {policyRoutes.map((r) => (
                <a key={r.path} href={r.path}>
                  {r.label.toUpperCase()}
                </a>
              ))}
              <button onClick={onManage}>Gestión</button>
            </nav>
          ) : dialog === "contact" ? (
            <>
              {contactChannels().length ? (
                <ul className="b-modal-channels">
                  {contactChannels().map((c) => (
                    <li key={c.kind}>
                      <span className="b-label">{c.label}</span>{" "}
                      <a href={c.href}>{c.value}</a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  Please see our <a href="/contact">contact page</a> for the
                  ways to reach our customer care team.
                </p>
              )}
              <p className="b-caption">{legalEntityLabel()}</p>
              <TextLink href="/contact">ALL CONTACT DETAILS</TextLink>
              <OrderAcknowledgement />
            </>
          ) : dialog === "story" ? (
            <>
              <p>{approved.hero}</p>
              <ImageFrame asset={assets.family} />
              <p>{approved.heritage}</p>
            </>
          ) : dialog === "collection" ? (
            <>
              <p>
                Message us and our team will share the cakes available today,
                with prices in AED.
              </p>
              <WhatsAppCTA
                unavailable={contact}
                message="Hello 3L, could you share your current collection?"
              >
                ASK FOR TODAY’S COLLECTION
              </WhatsAppCTA>
              <TextLink href="#jars">EXPLORE CAKE JARS</TextLink>
            </>
          ) : dialog === "social" ? (
            <>
              <p>@3L.DUBAI</p>
              {/* Reachable only when a profile is configured; the entry
                  points are hidden otherwise, so there is no empty state. */}
              <nav className="b-modal-nav" aria-label="Social profiles">
                {destinations.instagram && (
                  <a href={destinations.instagram}>INSTAGRAM</a>
                )}
                {destinations.tiktok && (
                  <a href={destinations.tiktok}>TIKTOK</a>
                )}
              </nav>
            </>
          ) : dialog === "faq" ? (
            <>
              <p>
                How ordering, delivery, cancellations and refunds work is set
                out in full on our policy pages.
              </p>
              <nav className="b-modal-nav" aria-label="Customer information">
                <a href="/contact">HOW TO ORDER</a>
                <a href="/delivery-policy">DELIVERY POLICY</a>
                <a href="/refund-policy">REFUND &amp; CANCELLATION</a>
                <a href="/terms">TERMS &amp; CONDITIONS</a>
              </nav>
              <Button onClick={contact}>CONTACT 3L</Button>
            </>
          ) : (
            <>
              <ImageFrame asset={assets.promotion} />
              {promotion.message && <p>{promotion.message}</p>}
              {promotion.cta && (
                <WhatsAppCTA unavailable={contact}>{promotion.cta}</WhatsAppCTA>
              )}
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
