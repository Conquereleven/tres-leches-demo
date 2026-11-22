import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useMenu, menuProductFamily, type StorefrontProduct } from "../menu";
import { useCheckoutConfig, useCheckoutNow, useCart, cartCount } from "../cart";
import { useLanguage } from "../localization";
import { availableSku } from "../../../shared/commerce-policy";
import { liveOrderable } from "../live-catalog";
import { ProductOptions } from "../MenuCatalog";
import { ResponsiveMedia } from "../media";
import { formatAed } from "../content";
import "./visual-v32.css";

/** Approved Visual Lab V3.2, isolated until separate merge/deploy approval.
 * All commerce data is from 3L's authoritative runtime catalog and checkout config.
 * The catalog grid MUST remain four columns on desktop.
 */
type Filter = "all" | "cakes" | "bakery" | "mexican" | "special";
const origin = "/visual-v32";
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
  const count=cartCount(useCart());
  return <header className="v32-header">
    <nav className="v32-nav" aria-label="3L Visual Lab">
      <span className="v32-nav-left"><a href={origin}>HOME</a><a href={origin+"/menu"}>Menu</a></span>
      <a className="v32-logo" href={origin}><strong>✧ 3L pastelerías</strong><small>MEXICO CITY SINCE 1982</small></a>
      <span className="v32-nav-right">
        <a href={origin+"/#journal"}>JOURNAL</a><a href="/contact">Contact</a>
        <label><span className="v32-sr">Language</span><select aria-label="Language" value={language}
          onChange={e=>setLanguage(e.target.value as typeof language)}>
          <option value="en">EN</option><option value="es">ES</option><option value="ar">AR</option>
        </select></label>
        <a href="/cart">CART ({count})</a>
      </span>
    </nav>
  </header>;
}
function Home(){
  return <main className="v32-home" id="main">
    <h1>More than a cake.<br/>A family tradition.</h1>
    <section className="v32-journey" aria-label="Mexico City 1982 to Dubai Today">
      <div className="v32-city"><img src="/brand/reference/mexico-dubai.png" alt="Mexico to Dubai heritage illustration"/>
        <b>MEXICO CITY</b><span>1982</span></div>
      <svg viewBox="0 0 540 100" className="v32-route" aria-hidden="true">
        <path d="M8 39 C90 -24 150 138 267 55 S417 56 529 38" fill="none" stroke="#b98a4e" strokeWidth="2"/>
        <circle cx="98" cy="37" r="17" fill="none" stroke="#b98a4e" strokeWidth="2"/>
        <circle cx="529" cy="38" r="9" fill="#f8ebe4" stroke="#b98a4e" strokeWidth="3"/>
      </svg>
      <div className="v32-city"><img src="/brand/approved/editorial-mexico-dubai.webp" alt="Dubai skyline illustration"/>
        <b>DUBAI</b><span>TODAY</span></div>
    </section>
    <section className="v32-story" id="journal">
      <div className="v32-family"><img src="/brand/reference/alicia.webp" alt="Alicia Luna Baeza"/>
        <img src="/brand/reference/liza.webp" alt="Liza preparing a cake"/>
        <i>Nuestra historia también huele a amor ♡</i></div>
      <div className="v32-legacy"><h2>Crafted with Love: The 3L Family Legacy</h2>
        <p>Hello everyone! I'm Liza, the founder of 3L in Dubai. Step into our world, where each Tres Leches cake is a symbol of our family's heritage, made with love and the finest natural ingredients.</p>
        <p>Our culinary story begins in 1982 in Mexico City, where Alicia Luna Baeza crafted Tres Leches Cakes for her loved ones. Today this family tradition continues in Dubai.</p>
        <a href={origin+"/menu"}>TREAT YOURSELF TO OUR TRES LECHES CAKES →</a>
      </div>
    </section>
  </main>;
}
function Landing(){
  return <main className="v32-landing" id="main">
    <span className="v32-eyebrow">THE 3L MENU</span><h1>Explore Our Menu</h1>
    <p className="v32-tagline">CAKES, BAKERY &amp; OUR SIGNATURE CREATIONS</p>
    <form action={origin+"/bakery"} className="v32-search">
      <span aria-hidden>⌕</span><input name="q" type="search" aria-label="Search the bakery" placeholder="Search the bakery..."/>
      <button type="submit">FIND →</button>
    </form>
    <div className="v32-tiles">
      <a href={origin+"/bakery?category=cakes"} className="v32-tile v32-cakes">
        <small>PASTELERÍA</small><strong>Cake</strong><em>Our signature cakes,<br/>fine pastries and<br/>seasonal creations.</em>
        <b>EXPLORE CAKES →</b>
      </a>
      <a href={origin+"/bakery?category=mexican"} className="v32-tile v32-breads">
        <small>PANADERÍA</small><strong>Bakery</strong><em>Artisanal breads,<br/>classic favorites and<br/>freshly baked goods.</em>
        <b>EXPLORE BAKERY →</b>
      </a>
    </div>
  </main>;
}
function ProductDialog({product,onClose,anchor}:{
  product:StorefrontProduct;onClose:()=>void;anchor:HTMLElement|null;
}){
  const [place,setPlace]=useState<CSSProperties>({left:12,top:12,maxHeight:"calc(100dvh - 24px)"});
  const panel=useRef<HTMLDivElement>(null);
  const closeButton=useRef<HTMLButtonElement>(null);
  useLayoutEffect(()=>{
    const recalc=()=>{
      const w=window.innerWidth,h=Math.round(window.visualViewport?.height??window.innerHeight);
      const r=anchor?.getBoundingClientRect(),pw=Math.min(490,w-24),ph=Math.min(650,h-24);
      if(w<=640||!r){const top=h<=720?12:Math.max(12,Math.min(r?.top??12,h-ph-12));
        setPlace({left:12,top,maxHeight:h-top-12});return;}
      const left=r.right+pw+12<=w?r.right+6:r.left-pw-12>=12?r.left-pw-6:Math.max(12,Math.min(w-pw-12,r.left+30));
      setPlace({left,top:Math.max(12,Math.min(r.top,h-ph-12)),maxHeight:ph});
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
      if(!e.shiftKey&&document.activeElement===controls.at(-1)){e.preventDefault();controls[0]?.focus();}
    };
    window.addEventListener("keydown",onKey);
    return ()=>{document.body.style.overflow=old;window.removeEventListener("keydown",onKey);};
  },[onClose]);
  return createPortal(<div className="v32-overlay">
    <div className="v32-scrim" onClick={onClose} aria-hidden/>
    <div ref={panel} className="v32-popup" role="dialog" aria-modal="true" aria-label={product.title} style={place}>
      <button ref={closeButton} type="button" className="v32-close" aria-label="Close" onClick={onClose}>×</button>
      <ProductOptions product={product} detail/>
    </div>
  </div>,document.body);
}
function Bakery(){
  const {language}=useLanguage();
  const menu=useMenu();
  const {config,loading,retry}=useCheckoutConfig();
  const now=useCheckoutNow(config);
  const params=new URLSearchParams(location.search);
  const raw=params.get("category")??"all";
  const initial:Filter=groups.some(g=>g.id===raw)?raw as Filter:
    raw==="pan"||raw==="conchas"?"mexican":"all";
  const [filter,setFilter]=useState<Filter>(initial);
  const [query,setQuery]=useState(params.get("q")??"");
  const [selected,setSelected]=useState<string|null>(null);
  const trigger=useRef<HTMLButtonElement|null>(null);
  const close=()=>{setSelected(null);trigger.current?.focus();};
  const available=menu.status!=="unavailable"&&menu.status!=="loading"&&!loading&&!!config;
  const items=available?menu.products.filter(p=>{
    const family=menuProductFamily(menu,p),q=query.trim().toLowerCase();
    return (filter==="all"||categoryFor(family.category)===filter)&&
      (!q||[p.title,p.description??"",family.name,p.variant].some(t=>t.toLowerCase().includes(q)));
  }):[];
  const active=items.find(p=>p.id===selected);
  return <main className="v32-catalog" id="main">
    <span className="v32-eyebrow">OUR MENU</span><h1>Traditional Mexican Bakery</h1>
    <p className="v32-tagline">CAKES, BREADS &amp; SIGNATURE CREATIONS</p>
    <form className="v32-search" onSubmit={e=>e.preventDefault()}>
      <span aria-hidden>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)}
      type="search" aria-label="Search the menu" placeholder="Search our menu..."/>
      <button type="submit">FIND →</button>
    </form>
    <div className="v32-filters" role="group" aria-label="Categories">
      {groups.map(g=><button key={g.id} type="button" className={filter===g.id?"v32-selected":""}
        aria-pressed={filter===g.id} onClick={()=>{setFilter(g.id);setSelected(null);}}>
        {g[language]}
      </button>)}
    </div>
    {!available?<div className="v32-message" role="status">
      <p>{loading||menu.status==="loading"?"Loading available products...":"Online ordering is unavailable."}</p>
      <button type="button" onClick={retry}>TRY AGAIN</button></div>:
      !items.length?<p className="v32-message" role="status">No matching products.</p>:
      <div className="v32-grid" data-grid-columns="4">
        {items.map(product=>{
          const family=menuProductFamily(menu,product);
          const valid=family.options.filter(option=>{
            const server=config?.products.find(p=>p.id===option.id);
            return availableSku(option.id,now)&&!!server&&server.priceFils===option.priceFils&&
              (menu.status!=="live"||liveOrderable(option.id)===true);
          });
          const price=valid.length?Math.min(...valid.map(v=>v.priceFils)):null;
          return <button type="button" key={product.id} className="v32-product" data-product-id={product.id}
            aria-haspopup="dialog" aria-expanded={selected===product.id} disabled={price===null}
            onClick={e=>{trigger.current=e.currentTarget;setSelected(product.id);}}>
            <span className="v32-photo"><ResponsiveMedia productId={product.id} family={family.id}
              variant={product.variant} alt={product.title}
              fallback={menu.status==="bundled"?family.image:null}/></span>
            <span className="v32-product-copy"><strong>{product.title}</strong><em>{product.description}</em>
              <span>{price===null?"UNAVAILABLE":"From "+formatAed(price)}<b aria-hidden>→</b></span>
            </span>
          </button>;
        })}
      </div>}
    {active&&<ProductDialog product={active} onClose={close} anchor={trigger.current}/>}
  </main>;
}
export function VisualV32(){
  const path=location.pathname.replace(/\/+$/,"");
  const page=path.endsWith("/bakery")?"bakery":path.endsWith("/menu")?"menu":"home";
  return <div className="v32-app" data-visual-preview="v32">
    <a className="v32-skip" href="#main">Skip to content</a><Header/>
    {page==="home"?<Home/>:page==="menu"?<Landing/>:<Bakery/>}
  </div>;
}
