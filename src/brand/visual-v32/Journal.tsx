import { useLanguage } from "../localization";

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
    source: "Read more about Rosca de Reyes",
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
    source: "Lee más sobre la Rosca de Reyes",
  },
  ar: {
    label: "مجلة 3L · تقاليد مكسيكية",
    title: "تاج من الحلوى ومائدة مفعمة بالمحبة.",
    intro:
      "في السادس من يناير من كل عام، تجتمع العائلات في أنحاء المكسيك لتتقاسم خبز روسكا دي رييس احتفاءً بزيارة المجوس الثلاثة. تعود أصول هذا الخبز الحلو إلى احتفالات عيد الغطاس في أوروبا، وقد أصبح له مكان خاص على الموائد المكسيكية.",
    crown: "تاج نتقاسمه",
    crownText:
      "يشبه شكل الخبز الدائري التاج، وتذكّر ثماره المسكّرة الملوّنة بالأحجار الكريمة. وترمز حلقته المتّصلة لدى كثير من العائلات المسيحية إلى المحبة الأبدية.",
    surprise: "مفاجأة صغيرة",
    surpriseText:
      "يرمز المجسّم الصغير المخبّأ في الخبز إلى الطفل يسوع. وفي التقاليد المكسيكية، يدعو من يعثر عليه الآخرين إلى تناول التاماليس في الثاني من فبراير، يوم عيد الشموع.",
    close: "من المكسيك إلى دبي، أحلى التقاليد هي التي نتشاركها.",
    source: "اقرأ المزيد عن روسكا دي رييس",
  },
} as const;

export function Journal() {
  const { language } = useLanguage();
  const t = copy[language];
  return (
    <main id="main" className="v32-journal">
      <article>
        <header>
          <p className="v32-eyebrow">{t.label}</p>
          <h1>{t.title}</h1>
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
          <p className="v32-journal-intro">{t.intro}</p>
        </header>
        <div className="v32-journal-sections">
          <section>
            <h2>{t.crown}</h2>
            <p>{t.crownText}</p>
          </section>
          <section>
            <h2>{t.surprise}</h2>
            <p>{t.surpriseText}</p>
          </section>
        </div>
        <p className="v32-journal-close">{t.close}</p>
        <a href="https://www.gob.mx/sre/articulos/rosca-de-reyes">{t.source}</a>
      </article>
    </main>
  );
}
