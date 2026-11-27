import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useMenu, menuProductFamily, type StorefrontProduct } from "../menu";
import { useCheckoutConfig, useCheckoutNow, useCart, cartCount } from "../cart";
import { useLanguage } from "../localization";
import { useLiveCatalog } from "../live-catalog";
import { purchasableOptions } from "./catalog-availability";
import { EntranceSketch, useMobileJourneyEntrance } from "../ScrollSketch";
import { Journal, RoscaStory } from "./Journal";
import { VisualCart, VisualCheckout, VisualReturn, VisualContact, VisualPolicy, VisualHowToOrder } from "./V32Commerce";
import { ApprovedProductCard, ApprovedPurchasePopup, productTitle, productDescription, storefrontMoney, useProductTitle } from "./ApprovedPurchaseSelector";
import { localizedSource } from "../locales/engine";
import { isPolicyPath } from "../business";
import { storefrontLabels } from "../../seo/pages";
import "./visual-v32.css";
import "./approved-vr008.css";

type Filter = "all" | "cakes" | "bakery" | "mexican" | "panettone" | "special";
const origin = typeof location !== "undefined" && location.pathname.startsWith("/visual-v32") ? "/visual-v32" : "";
const art = "/brand/vr008/";
const compactCatalog = "(max-width: 1023px)";
function subscribeViewport(change: () => void) {
  const media = window.matchMedia(compactCatalog);
  media.addEventListener("change", change);
  return () => media.removeEventListener("change", change);
}
const viewportSnapshot = () => window.matchMedia(compactCatalog).matches;
const serverViewport = () => false;

const visualNav = {
  en: {home:"Home",menu:"Menu",journal:"Journal",contact:"Contact",cart:"Cart",story:"The 3L story",support:"Customer care"},
  es: {home:"Inicio",menu:"Menú",journal:"Diario",contact:"Contacto",cart:"Carrito",story:"La historia de 3L",support:"Atención al cliente"},
  ar: {home:"الرئيسية",menu:"القائمة",journal:"المجلة",contact:"اتصل بنا",cart:"السلة",story:"قصة 3L",support:"خدمة العملاء"},
} as const;
const visualCopy = {
 en: {
  hero1:"More than a cake.",hero2:"A family tradition.",today:"TODAY",
  legacy:"Crafted with Love: The 3L Family Legacy",
  story1:"Hello everyone! I'm Liza, the founder of 3L in Dubai. Step into our world, where each Tres Leches cake is a symbol of our family's heritage, made with love and the finest natural ingredients.",
  story2:"Our culinary story begins in 1982, in our family home in Mexico City, where my grandmother, Alicia Luna Baeza, crafted magical Tres Leches Cakes for her loved ones. With a family of 12, each cake was a masterpiece of love and dedication. Today, with about 40 bakeries in Mexico City, we decided to bring this legacy of flavor and tradition to Dubai as well.",
  storyQuote:"Nuestra historia también huele a amor ♡",explore:"TREAT YOURSELF TO OUR DECADENT TRES LECHES CAKES →",
  menuEyebrow:"THE 3L MENU",menuTitle:"Explore Our Menu",menuTag:"CAKES, BAKERY & OUR SIGNATURE CREATIONS",
  searchBakery:"Search the bakery...",searchMenu:"Search our menu...",find:"FIND →",
  cakes:"Cake",bakery:"Bakery",cakesTag:"PASTELERÍA",bakeryTag:"PANADERÍA",
  cakesDesc:["Our signature cakes,", "fine pastries and", "seasonal creations."],
  bakeryDesc:["Artisanal breads,", "classic favorites and", "freshly baked goods."],
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
  cakesDesc:["Pasteles de la casa,", "repostería fina y", "creaciones de temporada."],
  bakeryDesc:["Panes artesanales,", "recetas clásicas y", "delicias recién horneadas."],
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
  hero1:"أكثر من مجرد كعكة،",hero2:"تقليد عائلي.",today:"اليوم",
  legacy:"صنع بحب: إرث عائلة 3L",
  story1:"أهلاً بكم، أنا ليزا، مؤسسة مخبز 3L في دبي. تحمل كل كعكة تريس ليتشيس شيئاً من تراث عائلتنا، ونحضّرها بحب وبمكونات طبيعية مختارة.",
  story2:"بدأت قصتنا في مدينة مكسيكو عام ١٩٨٢، عندما كانت أليسيا لونا بايثا تعدّ كعكة تريس ليتشيس لعائلتها وأحبّائها. واليوم نواصل هذا التقليد العائلي في دبي.",
  storyQuote:"وصفةٌ نتوارثها بحب",explore:"اكتشفوا كعكات تريس ليتشيس ←",
  menuEyebrow:"قائمة 3L",menuTitle:"استكشفوا قائمتنا",menuTag:"كعكات ومخبوزات وإبداعاتنا المميزة",
  searchBakery:"ابحث في المخبز",searchMenu:"ابحث في القائمة",find:"بحث",
  cakes:"الكعكات",bakery:"المخبوزات",cakesTag:"الحلويات",bakeryTag:"المخبوزات",
  cakesDesc:["كعكاتنا المميّزة", "وحلوياتنا الفاخرة", "ووصفات الموسم."],
  bakeryDesc:["خبز حرفي", "ووصفات كلاسيكية", "ومخبوزات طازجة."],
  exploreCakes:"استكشف الكعكات ←",exploreBakery:"استكشف المخبوزات ←",
  catalogEyebrow:"قائمتنا",catalogTitle:"المخبوزات المكسيكية التقليدية",catalogTag:"كعكات ومعجّنات من وصفاتنا المميّزة",
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
  {id:"cakes",en:"Cakes",es:"Pasteles",ar:"كعكات"},
  {id:"bakery",en:"Bakery",es:"Panadería",ar:"مخبوزات"},
  {id:"mexican",en:"Mexican Bakery",es:"Panadería Mexicana",ar:"مخبوزات مكسيكية"},
  {id:"panettone",en:"Panettone",es:"Panettone",ar:"بانيتوني"},
  {id:"special",en:"Special Flavors",es:"Sabores Especiales",ar:"نكهات خاصة"},
];
// Preserve VR008's opening sequence using published product IDs.
const catalogHighlights = {
  desktop: ["tres-leches--classic", "pan-de-muerto-traditional--azucar", "orejas", "conchas-traditional--vainilla", "tres-leches-mango--mango", "tres-leches--nutella", "tres-leches--coconut", "panettone-normal"],
  mobile: ["conchas-traditional--vainilla", "pan-de-muerto-traditional--azucar", "orejas", "tres-leches--classic", "tres-leches--coconut", "tres-leches-mango--mango", "tres-leches--nutella", "panettone-normal"],
};
const categoryFor=(category:string):Filter=>
  category==="cakes"||category==="jars"?"cakes":
  category==="bakery"?"bakery":
  category==="panettone"?"panettone":
  category==="pan"||category==="conchas"?"mexican":"special";

const navigationLabels = {
 en: { language: "Language", open: "Open navigation", close: "Close navigation", menu: "Mobile navigation", skip: "Skip to content", categories: "Categories", collections: "Published 3L categories", searchBakery: "Search the bakery", searchMenu: "Search the menu", footer: "V3.2 footer navigation" },
 es: { language: "Idioma", open: "Abrir navegación", close: "Cerrar navegación", menu: "Navegación móvil", skip: "Saltar al contenido", categories: "Categorías", collections: "Categorías publicadas de 3L", searchBakery: "Buscar en la panadería", searchMenu: "Buscar en el menú", footer: "Navegación al pie de página" },
 ar: { language: "اللغة", open: "فتح قائمة التنقل", close: "إغلاق قائمة التنقل", menu: "قائمة التنقل", skip: "انتقل إلى المحتوى", categories: "الفئات", collections: "فئات 3L المنشورة", searchBakery: "ابحث في المخبز", searchMenu: "ابحث في القائمة", footer: "روابط تذييل الصفحة" },
} as const;

function Icon({name}:{name:"menu"|"bag"|"search"|"arrow"|"chat"|"home"|"catalogue"|"journal"}){
  const shape={
    menu:<path d="M3 5h18M3 12h18M3 19h18"/>,
    home:<path d="m3 11 9-8 9 8M5 9v12h14V9M10 21v-7h4v7"/>,
    catalogue:<path d="M4 5h16v14H4zM4 11h16M12 11v8"/>,
    journal:<path d="M4 5h6l2 2 2-2h6v13h-6l-2 2-2-2H4zM12 7v13"/>,
    bag:<><path d="M5 8h14l2 13H3L5 8Z"/><path d="M8 9V6a4 4 0 0 1 8 0v3"/></>,
    search:<><circle cx="10.5" cy="10.5" r="6.7"/><path d="m16 16 5 5"/></>,
    arrow:<path d="M2 12h19m-6-5 6 5-6 5"/>,
    chat:<path d="M21 11a9 8 0 0 1-9 8H8l-5 3 1.7-5.4A8 7.5 0 0 1 3 11a9 8 0 0 1 18 0Z"/>,
  }[name];
  return <svg className={"icon icon-"+name} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shape}</svg>;
}

export function StorefrontHeader(){
  const {language,setLanguage}=useLanguage();
  const labels=visualNav[language], ui=navigationLabels[language];
  const href = (path: string) => (origin + path || "/") + (language === "en" ? "" : `?lang=${language}`);

  const count=cartCount(useCart());
  const menu=useRef<HTMLDivElement>(null);
  const navigationTrigger=useRef<HTMLButtonElement>(null);
  const [open,setOpen]=useState(false);
  const closeNavigation=useCallback((restoreFocus: boolean)=>{
    setOpen(false);
    if(restoreFocus) navigationTrigger.current?.focus();
  },[]);
  useEffect(()=>{
    if(!open)return;
    menu.current?.querySelector<HTMLAnchorElement>("nav a")?.focus();
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){event.preventDefault();closeNavigation(true);}
    };
    const closeOutside=(event:Event)=>{
      if(event.target instanceof Node && !menu.current?.contains(event.target) &&
        !navigationTrigger.current?.contains(event.target)) closeNavigation(false);
    };
    const viewport=window.matchMedia("(max-width: 900px)");
    const onResize=()=>{if(!viewport.matches)closeNavigation(false)};
    const onLeave=()=>closeNavigation(false);
    document.addEventListener("keydown",onKey);
    document.addEventListener("pointerdown",closeOutside);
    document.addEventListener("focusin",closeOutside);
    viewport.addEventListener("change",onResize);
    window.addEventListener("pagehide",onLeave);
    return ()=>{
      document.removeEventListener("keydown",onKey);
      document.removeEventListener("pointerdown",closeOutside);
      document.removeEventListener("focusin",closeOutside);
      viewport.removeEventListener("change",onResize);
      window.removeEventListener("pagehide",onLeave);
    };
  },[open,closeNavigation]);
  const displayCount=new Intl.NumberFormat(language==="ar"?"ar-AE-u-nu-arab":language).format(count);
  const languagePicker = (mobile=false)=><label className="vr009-language">
    <span className="v32-sr">{ui.language}</span>
    <select aria-label={ui.language} value={language} onChange={e=>setLanguage(e.target.value as typeof language)}>
      <option value="en">{mobile?"English":"🇬🇧"}</option><option value="es">{mobile?"Español":"ES"}</option><option value="ar">{mobile?"العربية":"AR"}</option>
    </select>
  </label>;
  const route=open?location.pathname.slice(origin.length).replace(/\/$/,""):"";
  const mobileLinks=[
    {path:"",label:labels.home,icon:"home",current:route===""},
    {path:"/menu",label:labels.menu,icon:"catalogue",current:/^\/(menu|bakery)(\/|$)/.test(route)},
    {path:"/journal",label:labels.journal,icon:"journal",current:route==="/journal"},
    {path:"/contact",label:labels.contact,icon:"chat",current:route==="/contact"},
    {path:"/cart",label:labels.cart,icon:"bag",current:route==="/cart"},
  ] as const;
  return <>
    <header className="mast">
      <button ref={navigationTrigger} className="mobile-nav" type="button" aria-label={ui.open} aria-controls="storefront-nav"
        aria-expanded={open} onClick={()=>open?closeNavigation(true):setOpen(true)}><Icon name="menu"/></button>
      <nav className="mast-left" aria-label={labels.menu}><a href={href("")}>{labels.home}</a><a href={href("/menu")}>{labels.menu}</a></nav>
      <a className="brand" href={href("")} dir="ltr"><img src={art+"wordmark-tight.png"} alt={storefrontLabels[language].wordmark}/></a>
      <nav className="mast-right" aria-label={labels.support}>
        <a href={href("/journal")}>{labels.journal}</a><a href={href("/contact")}>{labels.contact}</a>
        {languagePicker()}
        <a className="cart-text" href={href("/cart")}><Icon name="bag"/>{labels.cart} <bdi aria-live="polite">({displayCount})</bdi></a>
      </nav>
      <a className="mobile-bag" href={href("/cart")} aria-label={labels.cart}><Icon name="bag"/><output>{displayCount}</output></a>
      <div className="mobile-corner-nav glass" id="storefront-nav" ref={menu} role="dialog" aria-label={ui.menu}
        data-open={open} aria-hidden={open?undefined:true} inert={!open}>
        <button type="button" className="mobile-corner-close" aria-label={ui.close} onClick={()=>closeNavigation(true)}>×</button>
        <nav aria-label={ui.menu}>
          {mobileLinks.map(link=><a key={link.path} href={href(link.path)}
            aria-current={open&&link.current?"page":undefined} onClick={()=>closeNavigation(false)}>
            <Icon name={link.icon}/><span>{link.label}</span>
            {link.path==="/cart"&&<bdi className="mobile-corner-count">{displayCount}</bdi>}
          </a>)}
        </nav>
        <div className="mobile-corner-language">
          <span aria-hidden="true">{ui.language}</span>
          {languagePicker(true)}
        </div>
      </div>
    </header>
  </>;
}
function Blossoms(){
  return <div className="floral" aria-hidden="true"><img src={art+"blossom.png"} alt=""/><img src={art+"blossom.png"} alt=""/></div>;
}
function Home({staticPage}:{staticPage:boolean}){
  const {language}=useLanguage();const t=visualCopy[language];
  const journey=useRef<HTMLElement>(null);
  useMobileJourneyEntrance(journey);
  const cities = {
    en:{mexico:"Mexico City",dubai:"Dubai",since:"1982",journey:"Mexico City 1982 to Dubai today",help:"Need help?",liza:"Liza preparing a tres leches cake"},
    es:{mexico:"Ciudad de México",dubai:"Dubái",since:"1982",journey:"De Ciudad de México en 1982 a Dubái hoy",help:"¿Necesitas ayuda?",liza:"Liza preparando un pastel de tres leches"},
    ar:{mexico:"مدينة مكسيكو",dubai:"دبي",since:"١٩٨٢",journey:"من مدينة مكسيكو عام ١٩٨٢ إلى دبي اليوم",help:"هل تحتاج للمساعدة؟",liza:"ليزا تحضّر كعكة تريس ليتشيس"},
  }[language];
  return <main className="home-main" id="main">
    <div className="journey-composition">
      <h1 className="entrance">{t.hero1}<br/>{t.hero2}</h1>
      <section ref={journey} className="journey" dir="ltr" aria-label={cities.journey}>
        <figure className="city mexico" data-city="mexico"><img src={art+"mexico.png"} alt=""/><figcaption dir={language === "ar" ? "rtl" : undefined}>{cities.mexico}<span>{cities.since}</span></figcaption></figure>
        <svg viewBox="0 0 540 100" className="journey-svg" aria-hidden="true">
          <path className="journey-halo" d="M8 39 C90 -24 150 138 267 55 S417 56 529 38"/>
          <path className="journey-line" d="M8 39 C90 -24 150 138 267 55 S417 56 529 38"/>
          <circle cx="8" cy="39" r="6" fill="#c58327"/><circle cx="105" cy="39" r="21" fill="#f9ded3" stroke="#b97720" strokeWidth="2"/>
          <circle cx="105" cy="39" r="9" fill="#8b4d1c"/><circle cx="529" cy="38" r="9" fill="#f9e6df" stroke="#bd7923" strokeWidth="3"/>
          <g className="journey-traveller" aria-hidden="true">
            <circle r="7" fill="#f8e1aa" opacity=".8"/>
            <circle r="3.8" fill="#b47b30" stroke="#fff6df" strokeWidth="1.2"/>
          </g>
        </svg>
        <figure className="city dubai" data-city="dubai"><img src={art+"dubai.jpg"} alt=""/><figcaption dir={language === "ar" ? "rtl" : undefined}>{cities.dubai}<span>{t.today}</span></figcaption></figure>
      </section>
    </div>
    <section className="family" id="family-story">
      <div className="collage">
        <div className="alicia-frame">
          {staticPage?<img className="alicia-photo" src="/brand/reference/alicia.webp" alt="Alicia Luna Baeza"/>:<EntranceSketch label="Alicia Luna Baeza"/>}
        </div>
        <div className="liza-frame"><img src="/brand/reference/liza.webp" alt={cities.liza}/></div>
        <img className="collage-flower" src={art+"flower.png"} alt=""/>
        <img className="collage-vanilla" src={art+"vanilla.png"} alt=""/>
        <img className="tape tape-alicia" src={art+"tape.png"} alt=""/>
        <img className="tape tape-liza" src={art+"tape.png"} alt=""/>
        <img className="handwritten" src={art+"love.png"} lang="es" alt="Nuestra historia también huele a amor"/>
      </div>
      <div className="story entrance">
        <h2>{t.legacy}</h2><p>{t.story1}</p><p>{t.story2}</p>
        <a className="glass story-cta" href={origin+"/bakery?category=cakes"}>{t.explore.replace(/ [→←]$/,"")} <Icon name="arrow"/></a>
      </div>
    </section>
    <a className="glass help" href={origin+"/contact"}><Icon name="chat"/> {cities.help}</a>
  </main>;
}
function Landing(){
  const {language}=useLanguage();const t=visualCopy[language];
  return <main className="menu-main" id="main" data-visual-source="REF_A">
    <p className="kicker">{t.menuEyebrow}</p><h1>{t.menuTitle}</h1><p className="subheading">{t.menuTag}</p>
    <form className="search glass" action={origin+"/bakery"} role="search">
      <input type="hidden" name="lang" value={language}/>
      <Icon name="search"/><input name="q" type="search" dir="auto" aria-label={navigationLabels[language].searchBakery} placeholder={t.searchBakery}/>
      <button type="submit">{t.find.replace(/ [→←]$/,"")} <Icon name="arrow"/></button>
    </form>
    <section className="menu-cards" aria-label={navigationLabels[language].categories}>
      <article className="menu-category category-cake">
        <div className="category-copy"><p>{t.cakesTag}</p><h2>{t.cakes}</h2><span className="gold-rule" aria-hidden="true"/>
          <i>{t.cakesDesc.map(line=><span key={line}>{line}</span>)}</i><a href={origin+"/bakery?category=cakes"}>{t.exploreCakes.replace(/ [→←]$/,"")} <Icon name="arrow"/></a></div>
      </article>
      <article className="menu-category category-bakery">
        <div className="category-copy"><p>{t.bakeryTag}</p><h2>{t.bakery}</h2><span className="gold-rule" aria-hidden="true"/>
          <i>{t.bakeryDesc.map(line=><span key={line}>{line}</span>)}</i><a href={origin+"/bakery?category=mexican"}>{t.exploreBakery.replace(/ [→←]$/,"")} <Icon name="arrow"/></a></div>
      </article>
    </section>
  </main>;
}
function Bakery({search,staticPage=false,compact}:{search:string;staticPage?:boolean;compact:boolean}){
  const {language,text}=useLanguage();
  const published=useLiveCatalog();const t=visualCopy[language];
  const menu=useMenu();
  const {config,loading,retry}=useCheckoutConfig();
  const now=useCheckoutNow(config);
  const [urlSearch,setUrlSearch]=useState(search);
  const params=new URLSearchParams(urlSearch);
  const raw=params.get("category")??"all";
  const filter:Filter=groups.some(g=>g.id===raw)?raw as Filter:
    raw==="pan"||raw==="conchas"?"mexican":"all";
  const subcategory=params.get("subcategory")??(raw==="pan"||raw==="conchas"?raw:null);
  const [query,setQuery]=useState(params.get("q")??"");
  const [selected,setSelected]=useState<string|null>(null);
  const [filtersOpen,setFiltersOpen]=useState(false);
  const [addedMessage,setAddedMessage]=useState("");
  const trigger=useRef<HTMLButtonElement|null>(null);
  useEffect(()=>{
    const restore=()=>{
      setUrlSearch(location.search);
      setQuery(new URLSearchParams(location.search).get("q")??"");
      setSelected(null);
      setAddedMessage("");
    };
    window.addEventListener("popstate",restore);
    return ()=>window.removeEventListener("popstate",restore);
  },[]);
  const navigateFilters=(next:Filter,collection:string|null)=>{
    const url=new URL(location.href);
    if(next==="all")url.searchParams.delete("category");else url.searchParams.set("category",next);
    if(collection)url.searchParams.set("subcategory",collection);else url.searchParams.delete("subcategory");
    if(query.trim())url.searchParams.set("q",query.trim());else url.searchParams.delete("q");
    if(url.search!==location.search)history.pushState(history.state,"",url);
    setUrlSearch(url.search);
    setFiltersOpen(false);
    setSelected(null);
    setAddedMessage("");
  };
  const close=useCallback(()=>{setSelected(null);trigger.current?.focus({preventScroll:true});},[]);
  const afterAdd=useCallback(()=>{setAddedMessage(visualCopy[language].added);close();},[language,close]);
  const available=menu.status!=="unavailable"&&menu.status!=="loading"&&!loading&&!!config;
  const waiting=menu.status!=="unavailable"&&(loading||menu.status==="loading");
  const catalog = available ? menu.products.flatMap(product => {
    const family = menuProductFamily(menu,product);
    const options = purchasableOptions(family,menu.status,config,now);
    if (family.category === "pan" && !options.length) return [];
    return [{product, family, price: options.length ? Math.min(...options.map(o=>o.priceFils)) : null}];
  }) : [];
  const categoriesWithProducts = new Set(catalog.map(item=>item.family.category));
  const collections = filter==="all" ? [] : menu.categories.filter(c=>
    categoryFor(c.id)===filter && categoriesWithProducts.has(c.id));
  const categoryName=(id:string,name:string)=>{
    const item=published.status==="live"?published.catalog.categories.find(c=>c.id===id):undefined;
    const knownArabic:Record<string,string>={
      cakes:"الكعكات", jars:"كعكات في أكواب", bakery:"المخبوزات",
      pan:"بان دي مويرتو", conchas:"كونشا", panettone:"بانيتوني", special:"نكهات خاصة",
    };
    const translation=item?.content?.[language]?.name;
    return language==="ar"&&(!translation||translation===name)&&knownArabic[id]
      ? knownArabic[id] : translation??localizedSource(name,language);
  };
  const q=query.trim().toLocaleLowerCase(language);
  const matching=catalog.filter(({product,family,price})=>
    (filter==="all"||categoryFor(family.category)===filter)&&
    (!subcategory||family.category===subcategory)&&
    (!q||((price!==null||family.category==="panettone")&&[product.title, productTitle(product,language,published,text), product.description??"", productDescription(product,language,published)??"", product.variant,
      ...menu.categories.filter(c=>c.id===family.category).flatMap(c=>[c.name,categoryName(c.id,c.name)]),
      ...groups.filter(g=>g.id===categoryFor(family.category)).flatMap(g=>[g.en,g.es,g.ar]),
    ].some(value=>value.toLocaleLowerCase(language).includes(q)))));
  const highlights = compact ? catalogHighlights.mobile : catalogHighlights.desktop;
  const items = filter === "all" && !subcategory && !q
    ? [
        ...highlights.flatMap(id => matching.filter(({ product }) => product.id === id)),
        ...matching.filter(({ product }) => !highlights.includes(product.id)),
      ]
    : matching;
  const active=items.find(({product,price})=>product.id===selected&&price!==null)?.product;
  const ui=navigationLabels[language];
  const filters=<div id="catalog-categories" className="filters" role="group" aria-label={ui.categories} hidden={compact&&!filtersOpen}>
    {groups.filter(g=>g.id!=="panettone"||categoriesWithProducts.has("panettone")).map(g=><button key={g.id} type="button"
      aria-pressed={filter===g.id} onClick={()=>navigateFilters(g.id,null)}>{g[language]}</button>)}
  </div>;
  const searchForm=<form className="search glass" role="search" onSubmit={e=>{e.preventDefault();navigateFilters(filter,subcategory);}}>
    <Icon name="search"/><input name="q" value={query} onChange={e=>setQuery(e.target.value)}
      type="search" dir="auto" aria-label={ui.searchMenu} placeholder={t.searchMenu}/>
    <button type="submit">{t.find.replace(/ [→←]$/,"")} <Icon name="arrow"/></button>
  </form>;
  const products=<div className="catalog-products">
    {staticPage?<noscript><p className="v32-message">{storefrontLabels[language].productOptions} <a href={language==="en"?"/contact":`/contact?lang=${language}`}>{visualNav[language].contact}</a></p></noscript>:
      !available?<div className="v32-message" role="status"><p>{waiting?t.loading:t.orderingUnavailable}</p>
        <button type="button" onClick={retry}>{t.retry}</button></div>:
      !items.length?<p className="no-results v32-search-empty" role="status">{t.notFound}</p>:
      <div className={"product-grid structural-grid"+(compact?" vr007-grid":"")} data-grid-columns={compact?undefined:"4"}>
        {items.map(({product,family,price})=><ApprovedProductCard key={product.id} product={product}
          familyId={family.id} variant={product.variant} price={price}
          detailsHref={family.category==="panettone"&&price===null ? origin+"/menu/"+product.slug+(language==="en"?"":`?lang=${language}`) : undefined}
          active={active?.id===product.id} onSelect={element=>{
            trigger.current=element;setAddedMessage("");setSelected(product.id);
          }}>
          {active?.id===product.id&&<ApprovedPurchasePopup key={product.id} product={product} onClose={close} onAdded={afterAdd} anchor={trigger.current}/>}
        </ApprovedProductCard>)}
      </div>}
  </div>;
  return <main className="catalog-main" id="main">
    <div className="catalog-intro">
      <p className="kicker">{t.catalogEyebrow}</p>
      <h1>{compact&&language==="es"?"Panadería Mexicana":t.catalogTitle}</h1>
      <p className="subheading">{compact&&language==="es"?"Tradición que sabe a casa":t.catalogTag}</p>
      {compact?<div className="catalog-toolbar glass">{searchForm}
        <button type="button" className="category-trigger" aria-expanded={filtersOpen} aria-controls="catalog-categories"
          onClick={()=>setFiltersOpen(open=>!open)} onKeyDown={e=>{if(e.key==="Escape")setFiltersOpen(false);}}>
          <Icon name="menu"/><span>{ui.categories}</span><strong>{groups.find(group=>group.id===filter)?.[language]}</strong>
        </button>{filters}</div>:searchForm}
    </div>
    {!compact&&filters}
    {collections.length>1&&<div className="v32-subcategories" role="group" aria-label={ui.collections} data-category-source="published">
      <button type="button" className={!subcategory?"v32-subcategory-active":""} aria-pressed={!subcategory}
        onClick={()=>navigateFilters(filter,null)}>{language==="es"?"Todos":language==="ar"?"الكل":"All"}</button>
      {collections.map(cat=><button key={cat.id} type="button" data-category-id={cat.id}
        className={subcategory===cat.id?"v32-subcategory-active":""} aria-pressed={subcategory===cat.id}
        onClick={()=>navigateFilters(filter,cat.id)}>{categoryName(cat.id,cat.name)}</button>)}
    </div>}
    {products}
    <p className="v32-cart-status" role="status" aria-live="polite">{addedMessage}</p>
  </main>;
}

function MissingPage(){
  const {language}=useLanguage();
  return <main className="v32-new-page" id="main">
    <h1>{{en:"Page not found",es:"Página no encontrada",ar:"الصفحة غير موجودة"}[language]}</h1>
    <a href={origin+"/menu"}>{visualNav[language].menu}</a>
  </main>;
}

function ProductRoute({slug}:{slug:string}){
  const {language}=useLanguage();
  const menu=useMenu();
  const {config,loading,retry}=useCheckoutConfig();
  const now=useCheckoutNow(config);
  const product=menu.products.find(item=>item.slug===slug);
  if(menu.status==="unavailable")return <main className="v32-new-page" id="main">
    <p role="status">{visualCopy[language].orderingUnavailable}</p>
    <button type="button" onClick={retry}>{visualCopy[language].retry}</button>
  </main>;
  if(loading||menu.status==="loading")return <main className="v32-new-page" id="main">
    <p role="status">{visualCopy[language].loading}</p>
  </main>;
  if(!product)return <MissingPage/>;
  const family=menuProductFamily(menu,product);
  const options=purchasableOptions(family,menu.status,config,now);
  if(family.category==="pan"&&!options.length)return <MissingPage/>;
  return <ProductDetail key={product.id} product={product} family={family}
    price={options.length?Math.min(...options.map(option=>option.priceFils)):null}/>;
}

function ProductDetail({product,family,price}:{
  product:StorefrontProduct;family:ReturnType<typeof menuProductFamily>;price:number|null;
}){
  const {language}=useLanguage();
  const title=useProductTitle(product);
  const live=useLiveCatalog();
  const heldOptions=family.category==="panettone"&&live.status==="live"
    ? live.catalog.products.find(item=>item.id===product.id)?.options.filter(option=>!option.orderable) ?? []
    : [];
  const copy=visualCopy[language];
  const [anchor,setAnchor]=useState<HTMLButtonElement|null>(null);
  const [message,setMessage]=useState("");
  const close=useCallback(()=>{setAnchor(null);anchor?.focus();},[anchor]);
  return <main className="v32-new-page v32-product-page" id="main">
    <a href={origin+"/bakery"}>{visualNav[language].menu}</a>
    <h1>{title}</h1>
    <div className="v32-product-page-card">
      <ApprovedProductCard product={product} familyId={family.id} variant={product.variant}
        price={price} active={!!anchor} gallery onSelect={element=>{setMessage("");setAnchor(element);}}>
        {anchor&&price!==null&&<ApprovedPurchasePopup key={product.id} product={product}
          anchor={anchor} onClose={close} onAdded={()=>{setMessage(visualCopy[language].added);close();}}/>}
      </ApprovedProductCard>
      {heldOptions.length>0&&<ul className="v32-held-options" aria-label={copy.price}>
        {heldOptions.map(option=><li key={option.id} data-sku={option.id}>
          <strong>{option.content[language].sizeLabel??option.content[language].name??option.size}</strong>
          <span>{storefrontMoney(option.priceFils,language)}</span>
          <small>{copy.unavailable}</small>
        </li>)}
      </ul>}
    </div>
    <p role="status" aria-live="polite">{message}</p>
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
  const href = (path: string, fragment = "") => origin + path + (language === "en" ? "" : `?lang=${language}`) + fragment;
  return <footer className="v32-site-footer">
    <div className="v32-site-footer-brand"><img src={art+"wordmark-tight.png"} alt={storefrontLabels[language].wordmark}/></div>
    <nav aria-label={navigationLabels[language].footer}>
      <a href={href("/menu")}>{labels.menu}</a>
      <a href={href("/journal")}>{labels.journal}</a>
      <a href={href("/", "#family-story")}>{labels.story}</a>
      <a href={href("/contact")}>{labels.contact}</a>
      <a href={href("/cart")}>{labels.cart}</a>
      <a href={href("/terms")}>{t.legalTerms}</a>
      <a href={href("/privacy")}>{t.privacy}</a>
    </nav>
  </footer>;
}
export function StorefrontCheckoutFrame({children}: {children?: ReactNode}) {
  const { language } = useLanguage();
  return (
    <div className="vr009 vr009-checkout" lang={language} dir={language === "ar" ? "rtl" : "ltr"}>
      <a className="v32-skip" href="#main-content">{navigationLabels[language].skip}</a>
      <StorefrontHeader />
      {children}
    </div>
  );
}

export function VisualV32({pathname,search="",staticPage=false}:{pathname:string;search?:string;staticPage?:boolean}){
  const {language}=useLanguage();
  const compact=useSyncExternalStore(subscribeViewport,viewportSnapshot,serverViewport);
  const path=pathname.replace(/\/+$/,"").slice(origin.length) || "/";
  const home=path==="/", menu=path==="/menu", bakery=path==="/bakery";
  const commerce = ["/cart","/checkout","/checkout/return","/how-to-order","/contact"].includes(path) || isPolicyPath(path);
  const scene=home?"home-scene structural-home":menu?"menu-scene":bakery?
    "catalog-scene structural-catalog "+(compact?"mobile-scene vr007":"desktop-scene"):"public-scene structural-home";
  return <div className="v32-app vr009" lang={language} dir={language==="ar"?"rtl":"ltr"} data-visual-preview="v32" data-frontend="standalone-v32">
    <a className="v32-skip" href="#main">{navigationLabels[language].skip}</a>
    <div className={"scene "+scene}>
      <Blossoms/><StorefrontHeader/>
      {home?<Home staticPage={staticPage}/>:menu?<Landing/>:bakery?<Bakery search={search} staticPage={staticPage} compact={compact}/>:path==="/journal"?<Journal/>:
        staticPage&&path==="/cart"?<main id="main" />:
        path.startsWith("/menu/")?(staticPage?<main id="main" data-product-slot="true"/>:<ProductRoute slug={path.slice(6)}/>):commerce?
        <div className="v32-commerce-shell" data-visual-route={path}><VisualCommerce key={path} path={path}/></div>:<MissingPage/>}
    </div>
    {home&&<RoscaStory/>}
    <VisualFooter/>
  </div>;
}
