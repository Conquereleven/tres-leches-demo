import { useLanguage as useCustomerLanguage } from "./localization";
import {
  ScrollSketch,
  JourneyRoute,
  paintSketch,
  paintJourney,
} from "./ScrollSketch";
import { useEditorialMotion } from "./useEditorialMotion";
import { MenuPreview, HowToOrderGuide } from "./StorefrontGuide";
import { ResponsiveMedia } from "./media";
import { CustomerCopy } from "./localization";
import { useEffect, useRef, useState } from "react";
import { Pause, Play, ArrowRight, Star } from "@phosphor-icons/react";
import { SiteHeader, SiteFooter, FloatingShopping } from "./SiteChrome";
import { approved } from "./content";
import "./brand.css";
import "./storefront.css";
const media = (name: string) => `/brand/reference/${name}`;
/** Approved reference composition; no unfinished reference scaffolds or catalog duplication. */
export function BrandExperience({ onManage }: { onManage: () => void }) {
  const { text: localize } = useCustomerLanguage();

  const editorial = useEditorialMotion();
  const journal = useEditorialMotion({
    target: ".ref-scroll-sketch",
    from: 0.9,
    to: 0.4,
    paint: paintSketch,
  });
  const journey = useEditorialMotion<HTMLDivElement>({
    target: ".ref-route-motion",
    from: 0.92,
    to: 0.4,
    paint: paintJourney,
  });
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [allowMotion, setAllowMotion] = useState(false);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    const permitted =
      !motion.matches &&
      !connection?.saveData &&
      !["slow-2g", "2g"].includes(connection?.effectiveType ?? "");
    setAllowMotion(permitted);
    const onMotion = () => {
      if (motion.matches) {
        element.pause();
        setPlaying(false);
        setAllowMotion(false);
      }
    };
    motion.addEventListener("change", onMotion);
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) {
        element.pause();
        setPlaying(false);
      }
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      motion.removeEventListener("change", onMotion);
    };
  }, []);
  useEffect(() => {
    if (!allowMotion || !video.current) return;
    video.current.load();
    void video.current.play().catch(() => setPlaying(false));
  }, [allowMotion]);
  return (
    <div className="brand-experience b-entered ref-home">
      <a className="b-skip" href="#main-content">
        <CustomerCopy>Skip to content</CustomerCopy>
      </a>
      <SiteHeader
        home
        onContactUnavailable={() => {
          location.href = "/contact";
        }}
      />
      <main id="main-content">
        <section className="ref-hero" aria-label={localize("Hero")}>
          <video
            ref={video}
            width={540}
            height={960}
            aria-label={localize("Liza packaging a 3L cake")}
            poster="/brand/approved/packaging-poster.webp"
            autoPlay={allowMotion}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            muted
            playsInline
            loop
            preload="none"
            onError={() => setPlaying(false)}
          >
            {allowMotion && (
              <>
                <source
                  src="/brand/approved/packaging-540.mp4"
                  type="video/mp4"
                  media="(max-width: 640px)"
                />
                <source
                  src="/brand/approved/packaging-720.mp4"
                  type="video/mp4"
                />
              </>
            )}
          </video>
          <p className="ref-micro">
            <CustomerCopy>{approved.micro}</CustomerCopy>
          </p>
          <div className="ref-hero-copy">
            <h1>
              <CustomerCopy>Soaked in</CustomerCopy> <br />{" "}
              <CustomerCopy>Tradition.</CustomerCopy>
            </h1>
            <p>
              <CustomerCopy>{approved.hero}</CustomerCopy>
            </p>
            <button
              className="ref-watch"
              aria-label={localize(
                playing ? "Pause our story video" : "Watch our story",
              )}
              onClick={() => {
                if (!video.current) return;
                if (playing) {
                  video.current.pause();
                  setPlaying(false);
                } else {
                  setAllowMotion(true);
                  void video.current
                    .play()
                    .then(() => setPlaying(true))
                    .catch(() => setPlaying(false));
                }
              }}
            >
              {playing ? <Pause aria-hidden /> : <Play aria-hidden />}{" "}
              <CustomerCopy>
                {playing ? "PAUSE OUR STORY" : "WATCH OUR STORY"}
              </CustomerCopy>
            </button>
            <span className="ref-heritage">
              <CustomerCopy>MEXICO CITY</CustomerCopy> <br />{" "}
              <CustomerCopy>SINCE 1982</CustomerCopy>
            </span>
          </div>
        </section>
        <MenuPreview />
        <section id="story" className="ref-bridge">
          <h2>
            <CustomerCopy>More than a cake.</CustomerCopy> <br />
            <CustomerCopy>A family tradition.</CustomerCopy>
          </h2>
          <div className="ref-city ref-mexico">
            <span className="ref-city-crop">
              <img
                src={"/brand/approved/editorial-mexico-dubai.webp"}
                alt={localize("Mexico City cathedral, the brand’s 1982 origin")}
                loading="lazy"
              />
            </span>
            <span className="ref-city-label">
              <CustomerCopy>Mexico City</CustomerCopy> <small>1982</small>
            </span>
          </div>
          <div className="ref-journey" aria-hidden="true" ref={journey}>
            <img src={"/brand/approved/editorial-journey.svg"} alt="" />
            <JourneyRoute />
          </div>
          <div className="ref-city ref-dubai">
            <span className="ref-city-crop">
              <img
                src={"/brand/approved/editorial-mexico-dubai.webp"}
                alt={localize("Dubai skyline, where the tradition continues")}
                loading="lazy"
              />
            </span>
            <span className="ref-city-label">
              <CustomerCopy>Dubai</CustomerCopy>{" "}
              <small>
                <CustomerCopy>Today</CustomerCopy>
              </small>
            </span>
          </div>
          <p>
            <CustomerCopy>
              Born in Mexico City in 1982, 3L began with a family recipe made
              with love and shared around one table. Today, that same tradition
              continues in Dubai.
            </CustomerCopy>
          </p>
        </section>
        <section id="collection" className="ref-featured">
          <Star className="ref-star" weight="fill" aria-hidden />
          <p className="b-label">
            <CustomerCopy>OUR SIGNATURE FLAVORS</CustomerCopy>
          </p>
          <h2>
            <CustomerCopy>A little taste</CustomerCopy> <br />{" "}
            <CustomerCopy>of what we do.</CustomerCopy>
          </h2>
          <p>
            <CustomerCopy>
              Three iconic cakes, the same beloved tradition.
            </CustomerCopy>
          </p>
          <div className="ref-cakes">
            {[
              ["dulce", "DULCE DE LECHE"],
              ["mango", "MANGO"],
              ["saffron", "SAFFRON"],
            ].map(([id, label]) => (
              <a key={id} href="/menu?category=cakes">
                <ResponsiveMedia
                  family={
                    id === "dulce"
                      ? "tres-leches-premium"
                      : id === "mango"
                        ? "tres-leches-mango"
                        : "special-flavours-cake"
                  }
                  variant={
                    id === "dulce"
                      ? "Dulce de Leche"
                      : id === "mango"
                        ? "Mango"
                        : "Saffron"
                  }
                  alt={`${label!} product photograph`}
                />
                <span>{label}</span>
              </a>
            ))}
          </div>
          <a className="b-button" href="/menu?category=cakes">
            <CustomerCopy>VIEW ALL CAKES</CustomerCopy>{" "}
            <ArrowRight className="b-directional" aria-hidden />
          </a>
        </section>
        <section
          ref={editorial}
          className="ref-tradition"
          aria-label={localize("Tradition in every slice")}
        >
          <div className="ref-panel">
            <h2>
              <CustomerCopy>TRADITION</CustomerCopy> <br />{" "}
              <CustomerCopy>IN EVERY</CustomerCopy> <br />{" "}
              <CustomerCopy>SLICE.</CustomerCopy>
            </h2>
            <span className="ref-rule" aria-hidden />
            <p>
              <CustomerCopy>
                Tres Leches cakes made with time-honored recipes and a lot of
                love.
              </CustomerCopy>
            </p>
            <a className="b-link" href="/menu?category=cakes">
              <ArrowRight
                className="ref-cta-circle b-directional"
                aria-hidden
              />
              <span>
                <CustomerCopy>VIEW THE</CustomerCopy> <br />{" "}
                <CustomerCopy>COLLECTION</CustomerCopy>
              </span>
            </a>
          </div>
          <div className="ref-slices">
            <img
              className="ref-particles"
              src={"/brand/approved/editorial-cake-particles.webp"}
              alt=""
              loading="lazy"
            />
            <img
              className="ref-slice ref-slice-one"
              src={media("nutella.webp")}
              alt={localize("Nutella Tres Leches slice")}
              loading="lazy"
            />
            <img
              className="ref-slice ref-slice-two"
              src={media("coffee.webp")}
              alt={localize("Coffee Latte Tres Leches slice")}
              loading="lazy"
            />
            <img
              className="ref-slice ref-slice-three"
              src={media("original.webp")}
              alt={localize("Original Tres Leches slice")}
              loading="lazy"
            />
          </div>
        </section>
        <HowToOrderGuide />
        <section id="family-story" className="ref-family" ref={journal}>
          <div className="ref-collage">
            <img
              className="ref-paper"
              src={"/brand/approved/editorial-rose-paper.webp"}
              alt=""
              loading="lazy"
            />
            <img
              className="ref-beige"
              src={"/brand/approved/editorial-beige-paper.webp"}
              alt=""
              loading="lazy"
            />
            <ScrollSketch
              label={localize("Alicia Luna Baeza, 3L’s founding grandmother")}
            />
            <img
              className="ref-flower"
              src={"/brand/approved/editorial-flower.webp"}
              alt=""
              loading="lazy"
            />
            <img
              className="ref-vanilla"
              src={"/brand/approved/editorial-vanilla.webp"}
              alt=""
              loading="lazy"
            />
            <img
              className="ref-tape"
              src={"/brand/approved/editorial-tape.webp"}
              alt=""
              loading="lazy"
            />
            <img
              className="ref-love"
              src={"/brand/approved/editorial-love.webp"}
              alt={localize("Nuestra historia también huele a amor")}
              loading="lazy"
            />
            <img
              className="ref-liza"
              src={media("liza.webp")}
              alt={localize("Liza finishing a Tres Leches cake by hand")}
              loading="lazy"
            />
          </div>
          <div className="ref-family-copy">
            <h2>
              <CustomerCopy>
                Crafted with Love: The 3L Family Legacy
              </CustomerCopy>
            </h2>
            <p>
              <CustomerCopy>
                Hello everyone! I'm Liza, the founder of 3L in Dubai. Step into
                our world, where each Tres Leches cake is a symbol of our
                family's heritage, made with love and the finest natural
                ingredients.
              </CustomerCopy>
            </p>
            <p>
              <CustomerCopy>
                Our culinary story begins in 1982, in our family home in Mexico
                City, where my grandmother, Alicia Luna Baeza, crafted magical
                Tres Leches Cakes for her loved ones. With a family of 12, each
                cake was a masterpiece of love and dedication. Today, with about
                40 bakeries in Mexico City, we decided to bring this legacy of
                flavor and tradition to Dubai as well.
              </CustomerCopy>
            </p>
            <a className="b-button" href="/menu">
              <CustomerCopy>
                Treat yourself to our decadent Tres Leches cakes
              </CustomerCopy>{" "}
              <ArrowRight className="b-directional" aria-hidden />
            </a>
          </div>
        </section>
        <div className="ref-order-link">
          <a className="b-link" href="/how-to-order">
            <CustomerCopy>HOW TO ORDER</CustomerCopy>
          </a>
        </div>
      </main>
      <SiteFooter
        onContactUnavailable={() => {
          location.href = "/contact";
        }}
        onManage={onManage}
      />
      <FloatingShopping />
    </div>
  );
}
