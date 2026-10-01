import { MenuCatalog, MenuOptions } from "./MenuCatalog";
import { menuFamilies } from "./menu";
import { cartCount, useCart } from "./cart";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  Handbag,
  List,
  WhatsappLogo,
} from "@phosphor-icons/react";
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
  formatAed,
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
  | "product"
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
  const cartLines = useCart();
  const cartItems = cartCount(cartLines);
  const panDeMuerto = {
    ...collections.bakery[0]!,
    // Preserve the approved large family photograph; small flyer crops stay in cards.
    image: {
      ...collections.bakery[0]!.image,
      src: "/assets/pan-de-muerto.webp",
    },
  };
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
      <a href="#bakery" onClick={() => setDialog(null)}>
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
          <a href="#bakery">MENU</a>
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
          <a className="b-header-cart" href="/cart">
            CART <span>{cartItems}</span>
          </a>
        </nav>
        <a
          className="b-mobile-cart"
          href="/cart"
          aria-label={`Cart, ${cartItems} item${cartItems === 1 ? "" : "s"}`}
        >
          <Handbag aria-hidden />
          <span>{cartItems}</span>
        </a>
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
            ) : panDeMuerto.image.src ? (
              <img
                className="b-hero-poster"
                src={panDeMuerto.image.src}
                alt={panDeMuerto.image.alt}
                loading="eager"
                fetchPriority="high"
                decoding="async"
              />
            ) : (
              <div className="b-hero-canvas" aria-hidden="true" />
            )}
          </div>
          <div className="b-hero-copy">
            <SectionLabel>MEXICO CITY / SINCE 1982</SectionLabel>
            <h1>
              <span>PAN DE</span>
              <span>MUERTO.</span>
            </h1>
            <p>Traditional Mexican sweet bread.</p>
            <Button onClick={() => setDialog("product")}>
              SHOP NOW
              <ArrowUpRight aria-hidden />
            </Button>
          </div>
          <div className="b-hero-note">
            <p>FROM {formatAed(panDeMuerto.priceFils!)}</p>
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
          <SectionLabel>BEST SELLERS</SectionLabel>
          <div className="b-featured" data-reveal-group>
            <article className="b-featured-product">
              <button onClick={() => setDialog("product")}>
                <ImageFrame asset={panDeMuerto.image} />
                <span className="b-featured-meta">
                  <span>
                    <strong>Pan de Muerto</strong>
                    <small>Traditional and filled · Individual and packs</small>
                  </span>
                  <strong>From {formatAed(panDeMuerto.priceFils!)}</strong>
                </span>
              </button>
            </article>
            <div className="b-seasonal-note">
              <SectionLabel>SEASONAL</SectionLabel>
              <EditorialHeading>
                A MEXICAN TRADITION, NOW IN DUBAI.
              </EditorialHeading>
              <p>{approved.hero}</p>
              <Button onClick={() => setDialog("product")}>
                DISCOVER THE SEASON
              </Button>
            </div>
          </div>
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
        <MenuCatalog />
        <Section id="jars" className="b-family">
          <SectionLabel>CAKE JARS</SectionLabel>
          <EditorialHeading>A LITTLE SWEETNESS.</EditorialHeading>
          <TextLink href="#bakery">EXPLORE THE MENU</TextLink>
        </Section>
        <Section id="custom" className="b-family">
          <SectionLabel>THE 3L ATELIER</SectionLabel>
          <EditorialHeading>CUSTOM CAKES</EditorialHeading>
          <TextLink href="/contact">CONTACT 3L</TextLink>
        </Section>
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
          <TextLink href="/contact">REQUEST A CAKE</TextLink>
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
            <TextLink href="/contact">CONTACT 3L</TextLink>
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
            <TextLink href="#bakery">SHOP BAKERY</TextLink>
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
        className="b-support-wa"
        ariaLabel="WhatsApp support"
        unavailable={contact}
        message="Hello 3L, I need help with the online store."
      >
        <WhatsappLogo aria-hidden />
        <span>Need help?</span>
      </WhatsAppCTA>
      {dialog && (
        <Modal
          title={
            dialog === "menu"
              ? "EXPLORE 3L"
              : dialog === "product"
                ? "PAN DE MUERTO"
                : dialog === "contact"
                  ? "CONTACT 3L"
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
              <a href="/cart">CART ({cartItems})</a>
              {policyRoutes.map((r) => (
                <a key={r.path} href={r.path}>
                  {r.label.toUpperCase()}
                </a>
              ))}
              <button onClick={onManage}>Gestión</button>
            </nav>
          ) : dialog === "product" ? (
            <div className="b-product-dialog">
              <ImageFrame asset={panDeMuerto.image} />
              <div>
                <SectionLabel>SEASONAL BAKERY</SectionLabel>
                <MenuOptions
                  family={menuFamilies.find(
                    (family) => family.id === "pan-de-muerto-traditional",
                  )!}
                />
              </div>
            </div>
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
                Contact our team for the cakes available today, with prices in
                AED.
              </p>
              <TextLink href="/contact">ASK FOR TODAY’S COLLECTION</TextLink>
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
                <TextLink href="#bakery">{promotion.cta}</TextLink>
              )}
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
