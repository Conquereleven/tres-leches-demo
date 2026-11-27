import { useState } from "react";
import { useLanguage } from "../localization";
import { journalEditorial } from "./journal-editorial";
import "./journal.css";

const copy = {
  en: {
    label: "The 3L Journal · Mexican traditions",
    title: "A crown of sweetness, a table full of love.",
    intro:
      "Every January 6, families across Mexico gather to share Rosca de Reyes, a tradition celebrating the visit of the Three Wise Men. With roots in European Epiphany celebrations, this sweet bread found a special place at Mexican tables.",
    crown: "A crown to share",
    crownText:
      "Its ring recalls a crown, while colourful candied fruits evoke precious jewels. For many Christian families, its unbroken shape also represents eternal love.",
    surprise: "A little surprise",
    surpriseText:
      "The hidden figure represents the baby Jesus. In Mexican tradition, the person who finds it hosts tamales on February 2, Día de la Candelaria.",
    close:
      "From Mexico to Dubai, the sweetest traditions are the ones we share.",
    storyLink: "Read the story",
    photo: "Rosca de Reyes on wooden platters, decorated with candied fruit",
  },
  es: {
    label: "El diario de 3L · Tradiciones mexicanas",
    title: "Una corona dulce, una mesa llena de amor.",
    intro:
      "Cada 6 de enero, las familias de México se reúnen para partir la Rosca de Reyes y celebrar la visita de los Reyes Magos. Nacido de las celebraciones europeas de la Epifanía, este pan dulce encontró un lugar especial en las mesas mexicanas.",
    crown: "Una corona para compartir",
    crownText:
      "Su forma recuerda una corona y las frutas cristalizadas de colores evocan piedras preciosas. Para muchas familias cristianas, el círculo sin fin también representa el amor eterno.",
    surprise: "Una pequeña sorpresa",
    surpriseText:
      "La figurita escondida representa al Niño Jesús. Según la tradición mexicana, a quien le toca el muñeco le toca invitar los tamales el 2 de febrero, Día de la Candelaria.",
    close:
      "De México a Dubái, las tradiciones más dulces son las que compartimos.",
    storyLink: "Leer la historia",
    photo: "Roscas de Reyes en platos de madera, decoradas con fruta cristalizada",
  },
  ar: {
    label: "مجلة 3L · تقاليد مكسيكية",
    title: "خبزٌ على هيئة تاج، ومائدة تجمع الأحبّة.",
    intro:
      "في السادس من يناير من كل عام، تجتمع العائلات في أنحاء المكسيك لتتقاسم خبز روسكا دي رييس احتفاءً بزيارة المجوس الثلاثة. تعود أصول هذا الخبز الحلو إلى احتفالات عيد الغطاس في أوروبا، وقد أصبح له مكان خاص على الموائد المكسيكية.",
    crown: "تاج نتقاسمه",
    crownText:
      "يشبه الخبز الدائري تاجاً تزيّنه الفواكه المسكّرة الملوّنة كالأحجار الكريمة. وترمز حلقته المتّصلة لدى كثير من العائلات المسيحية إلى المحبة الأبدية.",
    surprise: "مفاجأة صغيرة",
    surpriseText:
      "يرمز المجسّم الصغير المخبّأ في الخبز إلى الطفل يسوع. وفي التقاليد المكسيكية، يدعو من يعثر عليه الآخرين إلى تناول التاماليس في الثاني من فبراير، يوم عيد الشموع.",
    close: "من المكسيك إلى دبي، أحلى التقاليد هي التي نتشاركها.",
    storyLink: "اقرأ الحكاية",
    photo: "خبز روسكا دي رييس مزيّن بالفواكه المسكّرة على أطباق خشبية",
  },
} as const;

const roscaImage = "/brand/editorial/rosca-de-reyes.jpg";

function RoscaPhoto({ alt, home = false }: { alt: string; home?: boolean }) {
  return (
    <figure className={home ? "rosca-story-photo" : "journal-portrait"}>
      <img src={roscaImage}
        srcSet={home ? `/brand/editorial/rosca-de-reyes-480.jpg 480w, ${roscaImage} 800w` : undefined}
        sizes={home ? "(max-width: 600px) 65vw, 240px" : undefined}
        width="800" height="1200" alt={alt}
        loading={home ? "lazy" : "eager"} decoding="async" />
    </figure>
  );
}

function JournalCrown() {
  return (
    <svg
      className="v32-journal-crown"
      viewBox="0 0 240 80"
      aria-hidden="true"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M96 56 89 29l19 13 12-23 12 23 19-13-7 27Zm0 6h48M120 6v8m-4-4h8M76 21v10m-5-5h10m83-5v10m-5-5h10" />
        <path d="M87 63C60 62 42 48 28 33m32 23c-14 5-26 2-32-4 11-4 19-4 27 0m-4-3C39 44 35 33 37 24c9 4 14 12 14 25m36 14c-16 6-27 9-38 6 6-7 15-10 27-8m77 2c27-1 45-15 59-30m-32 23c14 5 26 2 32-4-11-4-19-4-27 0m4-3c12-5 16-16 14-25-9 4-14 12-14 25m-36 14c16 6 27 9 38 6-6-7-15-10-27-8" />
      </g>
    </svg>
  );
}

export function Journal() {
  const { language } = useLanguage();
  const t = copy[language];
  const editorial = journalEditorial[language];
  const chapterNumbers = language === "ar" ? ["١", "٢", "٣", "٤", "٥"] : ["I", "II", "III", "IV", "V"];
  return (
    <main id="main" className="v32-journal editorial-journal">
      <article aria-labelledby="journal-title">
        <header className="journal-hero">
          <div className="journal-heading">
            <p className="journal-eyebrow"><span />{t.label}</p>
            <h1 id="journal-title">{t.title}</h1>
            <JournalCrown />
          </div>
          <RoscaPhoto alt={t.photo} />
          <div className="journal-introduction">
            <time className="journal-date" dateTime="01-06">{editorial.january}</time>
            <p className="v32-journal-intro">{editorial.intro}</p>
            <a className="glass journal-story-link" href="#journal-story">{t.storyLink}<span aria-hidden="true">↓</span></a>
          </div>
        </header>
        <div className="journal-chapters" id="journal-story" tabIndex={-1}>
          {editorial.chapters.map((chapter, index) => (
            <section className="journal-chapter" key={chapter.title}>
              <div className="journal-chapter-heading">
                <span className="journal-chapter-number" aria-hidden="true">{chapterNumbers[index]}</span>
                <h2>{chapter.title}</h2>
                {index === 3 && <time className="journal-date" dateTime="02-02">{editorial.february}</time>}
              </div>
              <div className="journal-chapter-body">
                {chapter.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                {index === 4 && <p className="v32-journal-close">{t.close}</p>}
              </div>
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}

export function RoscaStory() {
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);
  const t = copy[language];
  const labels = {
    en: ["The story of Rosca de Reyes", "Close the story of Rosca de Reyes"],
    es: ["Historia de la Rosca de Reyes", "Cerrar la historia de la Rosca de Reyes"],
    ar: ["حكاية روسكا دي رييس", "إغلاق حكاية روسكا دي رييس"],
  }[language];
  return <section className="rosca-story" id="rosca" aria-labelledby="rosca-label">
    <p id="rosca-label">{t.label}</p><h2>{t.title}</h2>
    <button type="button" className="glass" id="rosca-toggle" aria-controls="rosca-content"
      aria-expanded={open} onClick={()=>setOpen(value=>!value)}>{labels[open?1:0]}</button>
    <div className={open?"rosca-content is-open":"rosca-content"} id="rosca-content" inert={!open}>
      <div><article>{open && <RoscaPhoto alt={t.photo} home />}<p>{t.intro}</p><h3>{t.crown}</h3><p>{t.crownText}</p>
        <h3>{t.surprise}</h3><p>{t.surpriseText}</p><p>{t.close}</p></article></div>
    </div>
  </section>;
}
