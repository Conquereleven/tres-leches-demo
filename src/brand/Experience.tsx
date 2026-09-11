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
import "./brand.css";
type DialogKind =
  | "contact"
  | "story"
  | "collection"
  | "social"
  | "privacy"
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
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          entry.target.classList.toggle("b-in-view", entry.isIntersecting);
          if (entry.isIntersecting && !media.matches)
            entry.target.classList.add("b-arrive");
        }),
      { threshold: 0.08 },
    );
    node
      .querySelectorAll("[data-reveal],.b-ticker,.b-footer")
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
  return (
    <Section id={id} className={`b-product-experience b-${id}`}>
      <div className="b-product-copy">
        <SectionLabel>
          {id === "custom" ? "THE 3L ATELIER" : "THE COLLECTION"}
        </SectionLabel>
        <EditorialHeading>{title}</EditorialHeading>
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
              <span>
                {p.name ??
                  `${title === "CAKE JARS" ? "Flavor" : title === "CUSTOM CAKES" ? "Category" : "Product"} awaiting confirmation`}
              </span>
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
        <p className="b-caption">
          {product.name ?? `DATA SLOT · ${product.id}`}
        </p>
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
          {message ||
            "Subscriptions will open when our newsletter service is connected."}
        </p>
      </form>
    </Section>
  );
}
export function BrandExperience({ onManage }: { onManage: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  useMotion(root);
  const [dialog, setDialog] = useState<DialogKind>(null),
    [selectedDoor, setSelectedDoor] = useState<string>("jars"),
    [occasion, setOccasion] = useState(0),
    [entered, setEntered] = useState(false),
    [scrolled, setScrolled] = useState(false),
    [videoFailed, setVideoFailed] = useState(false);
  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let seen = false;
    try {
      seen = sessionStorage.getItem("3l-entered") === "1";
      sessionStorage.setItem("3l-entered", "1");
    } catch {
      /* Private storage may be unavailable; never block content. */
    }
    const timer = setTimeout(
      () => setEntered(true),
      seen || reduced.matches ? 0 : 3000,
    );
    const scroll = () => setScrolled(window.scrollY > 48);
    scroll();
    window.addEventListener("scroll", scroll, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", scroll);
    };
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
    <div
      ref={root}
      className={`brand-experience ${entered ? "b-entered" : ""}`}
      lang="en"
    >
      <a className="b-skip" href="#main-content">
        Skip to content
      </a>
      {!entered && (
        <div className="b-preloader" aria-hidden="true">
          <div className="b-preloader-mark">
            <StarMotif />
            <Logo variant="icon" />
          </div>
        </div>
      )}
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
              />
            ) : (
              <div className="b-hero-fallback">
                <Logo variant="circle" />
                <p className="b-caption">HERO FILM · ORIGINAL ASSET PENDING</p>
              </div>
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
          <div className="b-featured">
            {collections.featured.map((p, i) => (
              <article key={p.id}>
                <ImageFrame asset={p.image} />
                <h3>
                  {p.name ?? `Featured cake ${String(i + 1).padStart(2, "0")}`}
                </h3>
                <p className="b-caption">
                  {p.name ? "" : "DATA SLOT · Product selection pending"}
                </p>
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
            <p className="b-pending-copy">Approved family story pending.</p>
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
          <div className="b-doors">
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
            <p className="b-caption">
              Provisional categories · pending confirmation
            </p>
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
              <p className="b-caption">
                {occasions[occasion]} · approved gallery pending
              </p>
            </div>
          </div>
          <WhatsAppCTA
            unavailable={contact}
            message={`Hello 3L, I’d like to enquire about a cake for ${occasions[occasion]!.toLowerCase()}.`}
          >
            REQUEST A CAKE
          </WhatsAppCTA>
        </Section>
        <Section id="voices" className="b-voices">
          <SectionLabel>FROM YOUR MOMENTS</SectionLabel>
          <EditorialHeading>
            A LITTLE
            <br />
            SWEETNESS, SHARED.
          </EditorialHeading>
          <div className="b-voice-universe">
            {visibleTestimonials(testimonials).length
              ? visibleTestimonials(testimonials).map((t) => (
                  <blockquote key={t.id}>
                    <p>{t.text}</p>
                    <cite>{t.source}</cite>
                  </blockquote>
                ))
              : ["Google", "Instagram", "WhatsApp"].map((source) => (
                  <div className="b-voice-slot" key={source}>
                    <SectionLabel>{source}</SectionLabel>
                    <p>Verified customer voice pending.</p>
                  </div>
                ))}
          </div>
        </Section>
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
            <Button onClick={() => setDialog("social")}>
              FOLLOW OUR JOURNEY
              <ArrowUpRight aria-hidden />
            </Button>
          )}
        </Section>
        <section
          id="promotion"
          className="b-promotion-slot"
          aria-label="Promotional discovery"
        >
          <span className="b-caption">
            PROMOTION · Approved content pending
          </span>
          <button
            className="b-text-button"
            onClick={() => setDialog("promotion")}
          >
            Discover more
            <ArrowUpRight aria-hidden />
          </button>
        </section>
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
          </div>
          <ImageFrame asset={assets.dubai} />
        </Section>
        <Newsletter />
      </main>
      <footer className="b-footer">
        <div className="b-footer-main">
          <div>
            <Logo />
            <p>
              Cakes, jars, bakery
              <br />
              and so much more.
            </p>
            <SectionLabel>{approved.heritage}</SectionLabel>
          </div>
          <nav aria-label="Collections">
            <a href="#home">HOME</a>
            <a href="#collection">CAKES</a>
            <a href="#jars">CAKE JARS</a>
            <a href="#bakery">BAKERY</a>
            <a href="#occasions">SPECIAL OCCASIONS</a>
          </nav>
          <nav aria-label="Information">
            <button onClick={() => setDialog("faq")}>FAQ</button>
            <button onClick={contact}>CONTACT</button>
            {destinations.privacy ? (
              <a href={destinations.privacy}>PRIVACY</a>
            ) : (
              <button onClick={() => setDialog("privacy")}>PRIVACY</button>
            )}
            {(["instagram", "tiktok"] as const).map((network) =>
              destinations[network] ? (
                <a key={network} href={destinations[network]!}>
                  {network === "instagram" ? "Instagram" : "TikTok"}
                </a>
              ) : (
                <button key={network} onClick={() => setDialog("social")}>
                  {network === "instagram" ? "Instagram" : "TikTok"}
                </button>
              ),
            )}
            <WhatsAppCTA unavailable={contact}>WhatsApp</WhatsAppCTA>
          </nav>
          <WhatsAppCTA unavailable={contact} />
        </div>
        <p className="b-closing">
          SWEET PEOPLE.
          <br />
          BRIGHTER DAYS.
        </p>
        <div className="b-footer-bottom">
          <span>Pastelerías 3L</span>
          <div>
            <button onClick={onManage}>Gestión</button>
          </div>
        </div>
      </footer>
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
                      : dialog === "privacy"
                        ? "PRIVACY"
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
              <button onClick={onManage}>Gestión</button>
            </nav>
          ) : dialog === "contact" ? (
            <>
              <p>
                The official WhatsApp contact is awaiting confirmation. Ordering
                will be available here once it is connected.
              </p>
              <p className="b-caption">No message has been sent.</p>
            </>
          ) : dialog === "story" ? (
            <>
              <p>{approved.hero}</p>
              <ImageFrame asset={assets.family} />
              <p>
                The approved family story and original film are awaiting
                delivery.
              </p>
            </>
          ) : dialog === "collection" ? (
            <>
              <p>The complete cake collection is awaiting approval.</p>
              <TextLink href="#jars">EXPLORE CAKE JARS</TextLink>
            </>
          ) : dialog === "social" ? (
            <>
              <p>@3L.DUBAI</p>
              <p>Official social links are awaiting confirmation.</p>
            </>
          ) : dialog === "privacy" ? (
            <p>
              The approved privacy policy is awaiting publication. Newsletter
              subscriptions are currently unavailable.
            </p>
          ) : dialog === "faq" ? (
            <>
              <p>Ordering information is awaiting confirmation.</p>
              <Button onClick={contact}>CONTACT 3L</Button>
            </>
          ) : (
            <>
              <ImageFrame asset={assets.promotion} />
              <p>
                {promotion.message ??
                  "Approved promotional image and message pending."}
              </p>
              {promotion.enabled && promotion.cta && (
                <WhatsAppCTA unavailable={contact}>{promotion.cta}</WhatsAppCTA>
              )}
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
