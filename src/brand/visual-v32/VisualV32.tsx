import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import { useMenu, menuProductFamily, type StorefrontProduct } from "../menu";
import { useCheckoutConfig, useCheckoutNow, useCart, cartCount, minQty } from "../cart";
import { useLanguage } from "../localization";
import { availableSku } from "../../../shared/commerce-policy";
import { liveOrderable } from "../live-catalog";
import { VisualAddToCart, VisualCart, VisualCheckout, VisualReturn, VisualContact, VisualPolicy, VisualHowToOrder } from "./V32Commerce";
import { isPolicyPath } from "../business";
import { selectedProductMedia, publishedMediaAuthority } from "../media";
import { formatAed } from "../content";
import { packChoices, packQtyLabel, presentationLabel, toPackChoice } from "./catalog-options";
import "./visual-v32.css";

/** Approved Visual Lab V3.2, isolated until separate merge/deploy approval.
 * All commerce data is from 3L's authoritative runtime catalog and checkout config.
 * The catalog grid MUST remain four columns on desktop.
 */
type Filter = "all" | "cakes" | "bakery" | "mexican" | "special";
const origin = "/visual-v32";
const previewAssets = "/visual-v32-reference";
const fallbackPreviewAsset = (
  event: SyntheticEvent<HTMLImageElement>,
  fallback: string
) => {
  const image = event.currentTarget;
  image.onerror = null;
  image.src = fallback;
  image.parentElement?.setAttribute("data-fallback", "true");
};

const visualNav = {
  en: {home:"Home",menu:"Menu",journal:"Journal",contact:"Contact",cart:"Cart",story:"The 3L story",support:"Customer care"},
  es: {home:"Inicio",menu:"Menú",journal:"Historia",contact:"Contacto",cart:"Carrito",story:"La historia de 3L",support:"Atención al cliente"},
  ar: {home:"الرئيسية",menu:"القائمة",journal:"قصتنا",contact:"اتصل بنا",cart:"السلة",story:"قصة 3L",support:"خدمة العملاء"},
} as const;
const visualCopy = {
 en: {
  hero1:"More than a cake.",hero2:"A family tradition.",today:"TODAY",
  legacy:"Crafted with Love: The 3L Family Legacy",
  story1:"Hello everyone! I'm Liza, the founder of 3L in Dubai. Step into our world, where each Tres Leches cake is a symbol of our family's heritage, made with love and the finest natural ingredients.",
  story2:"Our culinary story begins in 1982 in Mexico City, where Alicia Luna Baeza crafted Tres Leches Cakes for her loved ones. Today this family tradition continues in Dubai.",
  storyQuote:"Nuestra historia también huele a amor ♡",explore:"TREAT YOURSELF TO OUR TRES LECHES CAKES →",
  menuEyebrow:"THE 3L MENU",menuTitle:"Explore Our Menu",menuTag:"CAKES, BAKERY & OUR SIGNATURE CREATIONS",
  searchBakery:"Search the bakery...",searchMenu:"Search our menu...",find:"FIND →",
  cakes:"Cake",bakery:"Bakery",cakesTag:"PASTRY",bakeryTag:"BAKERY",
  cakesDesc:"Our signature cakes, fine pastries and seasonal creations.",
  bakeryDesc:"Artisanal breads, classic favorites and freshly baked goods.",
  exploreCakes:"EXPLORE CAKES →",exploreBakery:"EXPLORE BAKERY →",
  catalogEyebrow:"OUR MENU",catalogTitle:"Traditional Mexican Bakery",catalogTag:"CAKES, BREADS & SIGNATURE CREATIONS",
  variants:"CHOOSE A VARIANT",price:"PRICE",from:"From ",unavailable:"UNAVAILABLE",
  loading:"Loading available products...",orderingUnavailable:"Online ordering is unavailable.",
  notFound:"No matching products.",retry:"TRY AGAIN",variantUnavailable:"Online ordering is unavailable for this variant.",
  legalTerms:"Terms & Conditions",privacy:"Privacy",
  minimum:(count:number)=>`Minimum order: ${count} pieces`,
  added:"Added to cart"
 },
 es: {
  hero1:"Más que un pastel.",hero2:"Una tradición familiar.",today:"HOY",
  legacy:"Hecho con amor: el legado familiar de 3L",
  story1:"Hola, soy Liza, fundadora de 3L en Dubái. Bienvenidos a nuestro mundo, donde cada pastel de tres leches representa la herencia de nuestra familia, preparado con amor e ingredientes naturales.",
  story2:"Nuestra historia comenzó en 1982 en Ciudad de México, cuando Alicia Luna Baeza preparaba pasteles de tres leches para sus seres queridos. Hoy seguimos esta tradición familiar en Dubái.",
  storyQuote:"Nuestra historia también huele a amor ♡",explore:"DESCUBRE NUESTROS PASTELES DE TRES LECHES →",
  menuEyebrow:"EL MENÚ DE 3L",menuTitle:"Explora nuestro menú",menuTag:"PASTELES, PANADERÍA Y NUESTRAS ESPECIALIDADES",
  searchBakery:"Busca en la panadería...",searchMenu:"Busca en el menú...",find:"BUSCAR →",
  cakes:"Pasteles",bakery:"Panadería",cakesTag:"PASTELERÍA",bakeryTag:"PANADERÍA",
  cakesDesc:"Nuestros pasteles de la casa, repostería y especialidades de temporada.",
  bakeryDesc:"Panes artesanales, clásicos favoritos y productos recién horneados.",
  exploreCakes:"EXPLORAR PASTELES →",exploreBakery:"EXPLORAR PANADERÍA →",
  catalogEyebrow:"NUESTRO MENÚ",catalogTitle:"Panadería mexicana tradicional",catalogTag:"PASTELES, PANES Y ESPECIALIDADES",
  variants:"ELIGE UNA VARIANTE",price:"PRECIO",from:"Desde ",unavailable:"NO DISPONIBLE",
  loading:"Cargando productos disponibles...",orderingUnavailable:"Los pedidos en línea no están disponibles.",
  notFound:"No se encontraron productos.",retry:"REINTENTAR",variantUnavailable:"Esta variante no está disponible para pedidos en línea.",
  legalTerms:"Términos y condiciones",privacy:"Privacidad",
  minimum:(count:number)=>`Pedido mínimo: ${count} piezas`,
  added:"Añadido al carrito"
 },
 ar: {
  hero1:"أكثر من مجرد كعكة.",hero2:"تقليد عائلي.",today:"اليوم",
  legacy:"صنع بحب: إرث عائلة 3L",
  story1:"مرحباً، أنا ليزا، مؤسسة 3L في دبي. أهلاً بكم في عالمنا، حيث تمثل كل كعكة تريس ليتشيس تراث عائلتنا، وتُحضّر بحب وبمكونات طبيعية.",
  story2:"بدأت قصتنا عام 1982 في مكسيكو سيتي، عندما أعدّت أليسيا لونا بايثا كعكات تريس ليتشيس لأحبتها. واليوم يستمر هذا التقليد العائلي في دبي.",
  storyQuote:"قصتنا تفوح أيضاً برائحة الحب ♡",explore:"اكتشفوا كعكات تريس ليتشيس ←",
  menuEyebrow:"قائمة 3L",menuTitle:"استكشفوا قائمتنا",menuTag:"كعكات ومخبوزات وإبداعاتنا المميزة",
  searchBakery:"ابحث في المخبز...",searchMenu:"ابحث في القائمة...",find:"بحث ←",
  cakes:"الكعكات",bakery:"المخبوزات",cakesTag:"الحلويات",bakeryTag:"المخبوزات",
  cakesDesc:"كعكاتنا المميزة وحلوياتنا وإبداعاتنا الموسمية.",
  bakeryDesc:"خبز حرفي ومفضلات كلاسيكية ومخبوزات طازجة.",
  exploreCakes:"استكشف الكعكات ←",exploreBakery:"استكشف المخبوزات ←",
  catalogEyebrow:"قائمتنا",catalogTitle:"المخبوزات المكسيكية التقليدية",catalogTag:"كعكات وخبز وإبداعات مميزة",
  variants:"اختر النوع",price:"السعر",from:"ابتداءً من ",unavailable:"غير متاح",
  loading:"جارٍ تحميل المنتجات المتاحة...",orderingUnavailable:"الطلبات عبر الإنترنت غير متاحة.",
  notFound:"لا توجد منتجات مطابقة.",retry:"حاول مجدداً",variantUnavailable:"هذا الخيار غير متاح للطلب عبر الإنترنت.",
  legalTerms:"الشروط والأحكام",privacy:"الخصوصية",
  minimum:(count:number)=>`الحد الأدنى للطلب: ${count} قطع`,
  added:"أُضيف إلى السلة"
 }
} as const;

const groups: {id: Filter; en: string; es: string; ar: string}[] = [
  {id:"all",en:"All Products",es:"Todos",ar:"الكل"},
  {id:"cakes",en:"Cakes",es:"Pasteles",ar:"كيك"},
  {id:"bakery",en:"Bakery",es:"Panadería",ar:"مخبوزات"},
  {id:"mexican",en:"Mexican Bakery",es:"Panadería Mexicana",ar:"مخبوزات مكسيكية"},
  {id:"special",en:"Special Flavors",es:"Sabores Especiales",ar:"نكهات خاصة"},
];
const categoryFor=(category:string):Filter=>
  category==="cakes"||category==="jars"?"cakes":
  category==="bakery"?"bakery":
  category==="pan"||category==="conchas"?"mexican":"special";

function Header(){
  const {language,setLanguage}=useLanguage();
  const labels=visualNav[language];
  const [mobileOpen,setMobileOpen]=useState(false);
  const count=cartCount(useCart());
  useEffect(()=>{
    if(!mobileOpen)return;
    const prior=document.body.style.overflow;
    document.body.style.overflow="hidden";
    const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape")setMobileOpen(false);};
    window.addEventListener("keydown",onKey);
    return ()=>{document.body.style.overflow=prior;window.removeEventListener("keydown",onKey);};
  },[mobileOpen]);
  return <>
    <header className="v32-header">
      <nav className="v32-nav" aria-label="3L Visual Lab">
        <button className="v32-mobile-toggle" type="button" aria-label={mobileOpen?"Close navigation":"Open navigation"}
          aria-controls="v32-mobile-links" aria-expanded={mobileOpen}
          onClick={()=>setMobileOpen(value=>!value)}>{mobileOpen?"×":"☰"}</button>
        <span className="v32-nav-left"><a href={origin}>{labels.home}</a><a href={origin+"/menu"}>{labels.menu}</a></span>
        <a className="v32-logo" href={origin}>
          <strong>✧ 3L pastelerías</strong>
          <span className="v32-logo-micro"><i/><small>MEXICO CITY SINCE 1982</small><i/></span>
        </a>
        <span className="v32-nav-right">
          <a href={origin+"/#journal"}>{labels.journal}</a><a href={origin+"/contact"}>{labels.contact}</a>
          <label className="v32-language-control"><span className="v32-sr">Language</span>
            <select aria-label="Language" value={language}
              onChange={e=>setLanguage(e.target.value as typeof language)}>
              <option value="en">🇬🇧 EN</option><option value="es">🇲🇽 ES</option><option value="ar">🇦🇪 AR</option>
            </select>
          </label>
          <a href={origin+"/cart"}><span className="v32-cart-glyph" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 8.5h15l-1 12h-13z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></svg></span>{labels.cart} (<span aria-live="polite">{count}</span>)</a>
        </span>
      </nav>
    </header>
    {mobileOpen&&createPortal(<div className="v32-mobile-portal" data-v32-mobile-menu="true">
      <button type="button" className="v32-mobile-backdrop"
        onClick={()=>setMobileOpen(false)} aria-label="Close navigation backdrop"/>
      <aside className="v32-mobile-drawer v32-mobile-sheet" id="v32-mobile-links" aria-label="Mobile navigation">
        <div className="v32-mobile-sheet-top">
          <strong>✧ 3L pastelerías</strong>
          <button type="button" aria-label="Close menu" onClick={()=>setMobileOpen(false)}>×</button>
        </div>
        <nav>
          <a href={origin} onClick={()=>setMobileOpen(false)}>{labels.home}</a>
          <a href={origin+"/menu"} onClick={()=>setMobileOpen(false)}>{labels.menu}</a>
          <a href={origin+"/#journal"} onClick={()=>setMobileOpen(false)}>{labels.journal}</a>
          <a href={origin+"/contact"} onClick={()=>setMobileOpen(false)}>{labels.contact}</a>
          <a href={origin+"/cart"} onClick={()=>setMobileOpen(false)}>{labels.cart} ({count})</a>
        </nav>
      </aside>
    </div>,document.body)}
  </>;
}
function Home(){
  const {language}=useLanguage();const t=visualCopy[language];
  const [familyRefFailed,setFamilyRefFailed]=useState(false);
  return <main className="v32-home v32-home-fidelity" id="main">
    <h1>{t.hero1}<br/>{t.hero2}</h1>
    <section className="v32-journey" aria-label="Mexico City 1982 to Dubai Today">
      <div className="v32-city v32-city-left"><div className="v32-city-crop v32-city-reference"><img
        src={previewAssets+"/mexico-city-illustration.jpg"} onError={e=>fallbackPreviewAsset(e,"/brand/reference/mexico-dubai.png")}
        alt="Mexico City 1982 illustration"/></div>
        <b>MEXICO CITY</b><span>1982</span></div>
      <svg viewBox="0 0 540 100" className="v32-route" aria-hidden="true">
        <path d="M8 39 C90 -24 150 138 267 55 S417 56 529 38" fill="none" stroke="#b98a4e" strokeWidth="2"/>
        <circle cx="98" cy="37" r="17" fill="none" stroke="#b98a4e" strokeWidth="2"/>
        <circle cx="529" cy="38" r="9" fill="#f8ebe4" stroke="#b98a4e" strokeWidth="3"/>
      </svg>
      <div className="v32-city v32-city-right"><div className="v32-city-crop v32-city-reference"><img
        src={previewAssets+"/dubai-illustration.jpg"} onError={e=>fallbackPreviewAsset(e,"/brand/reference/mexico-dubai.png")}
        alt="Dubai Today illustration"/></div>
        <b>DUBAI</b><span>{t.today}</span></div>
    </section>
    <section className="v32-story" id="journal">
      <div className="v32-family">
        {!familyRefFailed?<img className="v32-family-reference"
          src={previewAssets+"/family-collage-composite.jpg"}
          alt="Visual reference collage from the approved V3.2 mockup (not launch-ready photography)"
          onError={()=>setFamilyRefFailed(true)}/>:
          <div className="v32-family-fallback"><img src="/brand/reference/alicia.webp" alt="Alicia Luna Baeza"/>
            <img src="/brand/reference/liza.webp" alt="Liza preparing a cake"/>
            <i>{t.storyQuote}</i></div>}
      </div>
      <div className="v32-legacy"><h2>{t.legacy}</h2>
        <p>{t.story1}</p>
        <p>{t.story2}</p>
        <a href={origin+"/menu"}>{t.explore}</a>
      </div>
    </section>
  </main>;
}
function Landing(){
  const {language}=useLanguage();const t=visualCopy[language];
  const [query,setQuery]=useState("");
  const [submitted,setSubmitted]=useState(false);
  const keywords={
    cakes:["cake","pastel","berry","slice","pastries","seasonal","tres leches"],
    bakery:["bread","concha","croissant","pan","bakery","palmier","orejas"]
  };
  const normalized=query.trim().toLocaleLowerCase();
  const matches=normalized?Object.entries(keywords).filter(([,words])=>
    words.some(word=>word.includes(normalized)||normalized.includes(word))).map(([key])=>key):[];
  const noMatch=submitted&&!!normalized&&!matches.length;
  const search=(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();setSubmitted(true);};
  return <main className="v32-landing v32-landing-fidelity" id="main" data-visual-source="REF_A">
    <span className="v32-eyebrow">{t.menuEyebrow}</span><h1>{t.menuTitle}</h1>
    <p className="v32-tagline">{t.menuTag}</p>
    <form onSubmit={search} className="v32-search" role="search">
      <span aria-hidden="true">⌕</span><input value={query}
        onChange={event=>{setQuery(event.target.value);if(!event.target.value.trim())setSubmitted(false)}}
        name="q" type="search" aria-label="Search the bakery" placeholder={t.searchBakery}/>
      <button type="submit">{t.find}</button>
    </form>
    <div className="v32-search-results" aria-live="polite">
      {!!normalized&&matches.map(key=><span className="v32-result-pill" key={key}>
        {key==="cakes"?t.cakes:t.bakery}</span>)}
      {noMatch&&<p className="v32-search-empty">{language==="es"?
        "No encontramos resultados. Prueba pastel, pan o croissant.":language==="ar"?
        "لا توجد نتائج. جرّب الكعك أو الخبز أو الكرواسون.":"Nothing found. Try cake, bread or croissant."}</p>}
    </div>
    <div className="v32-tiles">
      <a href={origin+"/bakery?category=cakes"}
        className={"v32-tile v32-cakes"+(matches.includes("cakes")?" v32-tile-highlight":"")}>
        <small>{t.cakesTag}</small><strong>{t.cakes}</strong><span className="v32-gold-rule" aria-hidden="true"/>
        <em>{t.cakesDesc}</em><b>{t.exploreCakes}</b>
      </a>
      <a href={origin+"/bakery?category=mexican"}
        className={"v32-tile v32-breads"+(matches.includes("bakery")?" v32-tile-highlight":"")}>
        <small>{t.bakeryTag}</small><strong>{t.bakery}</strong><span className="v32-gold-rule" aria-hidden="true"/>
        <em>{t.bakeryDesc}</em><b>{t.exploreBakery}</b>
      </a>
    </div>
  </main>;
}
function ProductDialog({product,onClose,onAdded,anchor}:{
  product:StorefrontProduct;onClose:()=>void;onAdded:()=>void;anchor:HTMLElement|null;
}){
  const menu=useMenu();
  const {language}=useLanguage();const t=visualCopy[language];
  const {config,loading}=useCheckoutConfig();
  const now=useCheckoutNow(config);
  const family=menuProductFamily(menu,product);
  // The UI is a port of the V3.2 reference: pill variants + scrolling content +
  // persistent checkout action. All SKU/price/orderability decisions stay canonical.
  const allowed=family.options.filter(o=>{
    const server=config?.products.find(p=>p.id===o.id);
    return availableSku(o.id,now)&&!!server&&server.priceFils===o.priceFils&&
      (menu.status!=="live"||liveOrderable(o.id)===true);
  });
  const pack=packChoices(allowed);
  const initialPack=pack?.choices.find(c=>c.pieces===6&&c.presentation==="mini")??pack?.choices.find(c=>c.pieces===6);
  const [sku,setSku]=useState<string|null>(initialPack?.option.id??allowed[0]?.id??null);
  const chosen=allowed.find(o=>o.id===sku)??allowed[0];
  const selection=chosen?toPackChoice(chosen):null;
  const presentation=selection?.presentation??pack?.presentations[0]??"";
  const pick=(name:string,pieces:number)=>{
    const next=pack?.choices.find(c=>c.presentation===name&&c.pieces===pieces)
       ??pack?.choices.find(c=>c.presentation===name)
       ??pack?.choices.find(c=>c.pieces===pieces);
    if(next)setSku(next.option.id);
  };
  const [place,setPlace]=useState<CSSProperties>({left:12,top:12,maxHeight:"calc(100dvh - 24px)"});
  const [side,setSide]=useState<"right"|"left"|"overlap"|"mobile"|"mobile-compact">("mobile");
  const panel=useRef<HTMLDivElement>(null);
  const [controlsTarget,setControlsTarget]=useState<HTMLDivElement|null>(null);
  const [desktopQtyTarget,setDesktopQtyTarget]=useState<HTMLDivElement|null>(null);
  const closeButton=useRef<HTMLButtonElement>(null);
  useLayoutEffect(()=>{
    const recalc=()=>{
      const w=window.innerWidth,h=Math.round(window.visualViewport?.height??window.innerHeight);
      const r=anchor?.getBoundingClientRect(),pw=Math.min(448,w-24),ph=Math.min(610,h-50);
      if(w<=640||!r){
        const compact=h<=720;
        const top=compact?Math.max(12,Math.min(54,Math.round((h-540)/2))):
          Math.max(12,Math.min(Math.max(82,Math.min(r?.top??12,h*.28)),Math.max(12,h-580)));
        setPlace({left:12,top,maxHeight:h-top-12});setSide(compact?"mobile-compact":"mobile");
        return;
      }
      const alignment=r.right+pw+12<=w?"right":r.left-pw-12>=12?"left":"overlap";
      const left=alignment==="right"?r.right+6:alignment==="left"?r.left-pw-6:Math.max(12,Math.min(w-pw-12,r.right-pw*.35));
      const top=Math.max(12,Math.min(Math.max(90,r.top-12),Math.max(12,h-ph-12)));
      setPlace({left,top,maxHeight:ph});setSide(alignment);
    };
    recalc();window.addEventListener("resize",recalc);window.addEventListener("scroll",recalc,true);
    window.visualViewport?.addEventListener("resize",recalc);
    return ()=>{window.removeEventListener("resize",recalc);window.removeEventListener("scroll",recalc,true);
      window.visualViewport?.removeEventListener("resize",recalc);};
  },[anchor,product.id]);
  useEffect(()=>{
    const old=document.body.style.overflow;document.body.style.overflow="hidden";closeButton.current?.focus();
    const onKey=(e:KeyboardEvent)=>{
      if(e.key==="Escape")onClose();
      if(e.key!=="Tab"||!panel.current)return;
      const controls=Array.from(panel.current.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled])'));
      if(!controls.length)return;
      if(e.shiftKey&&document.activeElement===controls[0]){e.preventDefault();controls.at(-1)?.focus();}
      else if(!e.shiftKey&&document.activeElement===controls.at(-1)){e.preventDefault();controls[0]?.focus();}
    };
    window.addEventListener("keydown",onKey);
    return ()=>{document.body.style.overflow=old;window.removeEventListener("keydown",onKey);};
  },[onClose]);
  return createPortal(<div className="v32-overlay">
    <div className="v32-scrim" onClick={onClose} aria-hidden/>
    <div ref={panel} className="v32-popup" data-selected-sku={chosen?.id??""} data-anchor-side={side}
      role="dialog" aria-modal="true" aria-label={family.name} style={place}>
      <div className="v32-popup-scroll">
        <div className="v32-popup-heading">
          <div><h2>{family.name.replace(/\s*[·–—-]\s*Pack\b.*$/i,"")}</h2>{product.description&&<p>{product.description}</p>}</div>
          <button ref={closeButton} type="button" className="v32-close"
            aria-label="Close" onClick={onClose}>×</button>
        </div>
        <p className="v32-section-caption">{t.variants}</p>
        {pack?<div className={"v32-pack-selector "+(pack.choices.length<=4?"v32-quick-four":"v32-guided-packs")}
          data-commerce-options="canonical" data-choice-count={pack.choices.length}>
          {pack.choices.length<=4?<div className="v32-variants v32-quick-options" role="group" aria-label="Choose a variant">
            {[...pack.choices].sort((a,b)=>a.pieces-b.pieces||((a.presentation==="mini"?0:1)-(b.presentation==="mini"?0:1))).map(choice=><button key={choice.option.id} type="button"
              className={choice.option.id===chosen?.id?"v32-variant v32-variant-current":"v32-variant"}
              data-pack-presentation={choice.presentation} data-pack-pieces={choice.pieces} data-sku={choice.option.id}
              aria-pressed={choice.option.id===chosen?.id} onClick={()=>setSku(choice.option.id)}>
              <span>{packQtyLabel(choice.pieces,language)} {choice.presentation==="mini"?"(Mini)":choice.presentation==="individual"?"(Individual)":""}</span>
              <small>{formatAed(choice.option.priceFils)}</small>
            </button>)}
          </div>:<>
            <div className="v32-option-group" role="group" aria-label="Choose presentation">
              <span className="v32-option-caption">{language==="es"?"Presentación":language==="ar"?"الحجم":"Presentation"}</span>
              <div className="v32-variants v32-pack-presentations">
                {pack.presentations.map(name=><button key={name} type="button"
                  className={presentation===name?"v32-variant v32-variant-current":"v32-variant"}
                  data-pack-presentation={name} aria-pressed={presentation===name}
                  onClick={()=>pick(name,selection?.pieces??1)}>
                  <span>{presentationLabel(name,language)}</span>
                </button>)}
              </div>
            </div>
            <div className="v32-option-group" role="group" aria-label="Choose pack quantity">
              <span className="v32-option-caption">{language==="es"?"¿Qué cantidad deseas?":language==="ar"?"ما هي الكمية؟":"How would you like it?"}</span>
              <div className={"v32-variants v32-pack-quantities "+(pack.quantities.length===3?"v32-three-quantities":"")}>
                {pack.quantities.map(pieces=>{
                  const candidate=pack.choices.find(c=>c.presentation===presentation&&c.pieces===pieces);
                  return <button key={pieces} type="button" data-pack-pieces={pieces}
                    className={candidate?.option.id===chosen?.id?"v32-variant v32-variant-current":"v32-variant"}
                    aria-pressed={candidate?.option.id===chosen?.id} disabled={!candidate}
                    onClick={()=>pick(presentation,pieces)}>
                    <span>{packQtyLabel(pieces,language)}</span>
                    <small>{candidate?formatAed(candidate.option.priceFils):"—"}</small>
                  </button>;
                })}
              </div>
            </div>
          </>}
          {selection?.pieces&&selection.pieces>1&&<p className="v32-pack-helper" data-pack-piece-count>
            {language==="es"?"Incluye "+selection.pieces+" piezas · se compra por caja":
             language==="ar"?"تحتوي العلبة على "+selection.pieces+" قطع":
             selection.pieces+" pieces in each box"}
          </p>}
        </div>:<div className="v32-variants v32-standard-options" role="group" aria-label="Choose a variant">
          {allowed.map(o=><button key={o.id} type="button" data-sku={o.id}
            className={o.id===chosen?.id?"v32-variant v32-variant-current":"v32-variant"}
            aria-pressed={o.id===chosen?.id} onClick={()=>setSku(o.id)}>
            <span>{o.size}</span><small>{formatAed(o.priceFils)}</small>
          </button>)}
        </div>}
        <div className="v32-popup-controls-anchor" ref={setControlsTarget}/>
        {chosen&&minQty(chosen.id)>1&&
          <p className="v32-minimum" data-minimum-notice>{t.minimum(minQty(chosen.id))}</p>}
        {!chosen&&!loading&&<p role="status">{t.orderingUnavailable}</p>}
      </div>
      <div className="v32-popup-footer">
        <div className="v32-desktop-qty-target" ref={setDesktopQtyTarget}/>
        {chosen?<VisualAddToCart key={product.id} productId={chosen.id} onAdded={onAdded}
          controlsTarget={controlsTarget} desktopQtyTarget={desktopQtyTarget}/>:
          <button disabled type="button">ADD TO CART · UNAVAILABLE</button>}
      </div>
    </div>
  </div>,document.body);
}
function Bakery(){
  const {language}=useLanguage();const t=visualCopy[language];
  const menu=useMenu();
  const {config,loading,retry}=useCheckoutConfig();
  const now=useCheckoutNow(config);
  const params=new URLSearchParams(location.search);
  const raw=params.get("category")??"all";
  const initial:Filter=groups.some(g=>g.id===raw)?raw as Filter:
    raw==="pan"||raw==="conchas"?"mexican":"all";
  const [filter,setFilter]=useState<Filter>(initial);
  const [subcategory,setSubcategory]=useState<string|null>(params.get("subcategory"));
  const [query,setQuery]=useState(params.get("q")??"");
  const [selected,setSelected]=useState<string|null>(null);
  const [addedMessage,setAddedMessage]=useState("");
  const trigger=useRef<HTMLButtonElement|null>(null);
  const close=useCallback(()=>{setSelected(null);trigger.current?.focus();},[]);
  const afterAdd=useCallback(()=>{setAddedMessage(visualCopy[language].added);close();},[language,close]);
  const available=menu.status!=="unavailable"&&menu.status!=="loading"&&!loading&&!!config;
  const collections=filter==="all"?[]:menu.categories.filter(c=>categoryFor(c.id)===filter);
  const items=available?menu.products.filter(p=>{
    const family=menuProductFamily(menu,p),q=query.trim().toLowerCase();
    return (filter==="all"||categoryFor(family.category)===filter)&&
      (!subcategory||family.category===subcategory)&&
      (!q||[p.title,p.description??"",family.name,p.variant].some(t=>t.toLowerCase().includes(q)));
  }):[];
  const active=items.find(p=>p.id===selected);
  return <main className="v32-catalog v32-catalog-fidelity" id="main">
    <span className="v32-eyebrow">{t.catalogEyebrow}</span><h1>{t.catalogTitle}</h1>
    <p className="v32-tagline">{t.catalogTag}</p>
    <form className="v32-search" onSubmit={e=>e.preventDefault()}>
      <span aria-hidden>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)}
      type="search" aria-label="Search the menu" placeholder={t.searchMenu}/>
      <button type="submit">{t.find}</button>
    </form>
    <div className="v32-filters" role="group" aria-label="Categories">
      {groups.map(g=><button key={g.id} type="button" className={filter===g.id?"v32-selected":""}
        aria-pressed={filter===g.id} onClick={()=>{setFilter(g.id);setSubcategory(null);setSelected(null);}}>
        {g[language]}
      </button>)}
    </div>
    {collections.length>1&&<div className="v32-subcategories" role="group" aria-label="Published 3L categories" data-category-source="published">
      <button type="button" className={!subcategory?"v32-subcategory-active":""} aria-pressed={!subcategory}
        onClick={()=>{setSubcategory(null);setSelected(null);}}>{language==="es"?"Todos":language==="ar"?"الكل":"All"}</button>
      {collections.map(cat=><button key={cat.id} type="button" data-category-id={cat.id}
        className={subcategory===cat.id?"v32-subcategory-active":""} aria-pressed={subcategory===cat.id}
        onClick={()=>{setSubcategory(cat.id);setSelected(null);}}>{cat.name}</button>)}
    </div>}
    {!available?<div className="v32-message" role="status">
      <p>{loading||menu.status==="loading"?t.loading:t.orderingUnavailable}</p>
      <button type="button" onClick={retry}>{t.retry}</button></div>:
      !items.length?<p className="v32-message" role="status">{t.notFound}</p>:
      <div className="v32-grid" data-grid-columns="4">
        {items.map(product=>{
          const family=menuProductFamily(menu,product);
          const valid=family.options.filter(option=>{
            const server=config?.products.find(p=>p.id===option.id);
            return availableSku(option.id,now)&&!!server&&server.priceFils===option.priceFils&&
              (menu.status!=="live"||liveOrderable(option.id)===true);
          });
          const price=valid.length?Math.min(...valid.map(v=>v.priceFils)):null;
          return <button type="button" key={product.id} className="v32-product" data-category-id={family.category} data-product-id={product.id}
            aria-haspopup="dialog" aria-expanded={selected===product.id} data-selected-product={selected===product.id} disabled={price===null}
            onClick={e=>{trigger.current=e.currentTarget;setAddedMessage("");setSelected(product.id);}}>
            <span className="v32-photo">{(()=>{
              const canonical=selectedProductMedia(product.id,family.id,product.variant);
              const src=canonical?.derivatives.find(d=>d.format==="webp")?.src
                ??canonical?.derivatives[0]?.src
                ??(!publishedMediaAuthority()?family.image:null);
              return src?<img src={src} alt={product.title} loading="lazy"/>:
                <span className="v32-photo-empty" role="img" aria-label={product.title+" — photograph pending"}
                  data-media-state="unassigned"><strong>✧ 3L</strong><small>{language==="es"?"Fotografía pendiente":language==="ar"?"الصورة قيد الإعداد":"Photo pending"}</small></span>;
            })()}
              <span className={selected===product.id?"v32-card-heart v32-card-chosen":"v32-card-heart"} aria-hidden="true">
                {selected===product.id?
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m4 12 5 5L20 6"/></svg>:
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 8.1c0 4-5 7.4-8.8 10.9C8.2 15.5 3.2 12.1 3.2 8.1c0-4 5.2-5.8 8.8-2.2 3.6-3.6 8.8 2.2z"/></svg>}
              </span></span>
            <span className="v32-product-copy"><strong>{product.title}</strong>
              <em>{family.options.some(o=>toPackChoice(o).pieces>=6)?
                (language==="es"?"Presentaciones disponibles: media docena y docena":language==="ar"?"تتوفر عبوات متعددة":"Half-dozen and dozen options"):
                product.description}</em>
              <span>{price===null?t.unavailable:t.from+formatAed(price)}<b aria-hidden>→</b></span>
            </span>
          </button>;
        })}
      </div>}
    <p className="v32-cart-status" role="status" aria-live="polite">{addedMessage}</p>
    {active&&<ProductDialog product={active} onClose={close} onAdded={afterAdd} anchor={trigger.current}/>}
  </main>;
}
/** The existing commercial components own checkout and policy facts. V3.2 owns
 * only their visual frame/navigation in isolated preview, never payment logic.
 */
function VisualCommerce({path}:{path:string}) {
  if(path==="/cart")return <VisualCart/>;
  if(path==="/checkout")return <VisualCheckout/>;
  if(path==="/checkout/return")return <VisualReturn/>;
  if(path==="/how-to-order")return <VisualHowToOrder/>;
  if(path==="/contact")return <VisualContact/>;
  if(isPolicyPath(path))return <VisualPolicy path={path}/>;
  return null;
}
function VisualFooter(){
  const {language}=useLanguage();
  const labels=visualNav[language];const t=visualCopy[language];
  return <footer className="v32-site-footer">
    <div className="v32-site-footer-brand"><strong>✧ 3L pastelerías</strong><small>MEXICO CITY SINCE 1982</small></div>
    <nav aria-label="V3.2 footer navigation">
      <a href={origin+"/menu"}>{labels.menu}</a>
      <a href={origin+"/contact"}>{labels.contact}</a>
      <a href={origin+"/cart"}>{labels.cart}</a>
      <a href={origin+"/terms"}>{t.legalTerms}</a>
      <a href={origin+"/privacy"}>{t.privacy}</a>
    </nav>
  </footer>;
}
export function VisualV32(){
  // Load the reference's Google Fonts stylesheet only inside the isolated V3.2
  // visual route. Global CSS @import triggered CSP connect-src errors across
  // the legacy storefront; stylesheet <link> follows existing style-src rules.
  useEffect(()=>{
    const link=document.createElement("link");
    link.rel="stylesheet";
    link.href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Jost:wght@400;500;600&display=swap";
    link.referrerPolicy="no-referrer";
    link.dataset.v32FontSheet="true";
    document.head.appendChild(link);
    return ()=>{link.remove();};
  },[]);
  const path=location.pathname.replace(/\/+$/,"").slice(origin.length) || "/";
  const commerce = ["/cart","/checkout","/checkout/return","/how-to-order"].includes(path) || isPolicyPath(path);
  return <div className="v32-app" data-visual-preview="v32" data-frontend="standalone-v32">
    <a className="v32-skip" href="#main">Skip to content</a>
    <Header/>
    <div className="v32-blossom" aria-hidden="true"/>
    {path==="/menu"?<Landing/>:path==="/bakery"?<Bakery/>:commerce?
      <div className="v32-commerce-shell" data-visual-route={path}><VisualCommerce path={path}/></div>:<Home/>}
    <VisualFooter/>
  </div>;
}
