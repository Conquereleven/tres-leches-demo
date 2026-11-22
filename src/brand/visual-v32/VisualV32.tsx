import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useMenu, menuProductFamily, type StorefrontProduct } from "../menu";
import { useCheckoutConfig, useCheckoutNow, useCart, cartCount } from "../cart";
import { useLanguage } from "../localization";
import { availableSku } from "../../../shared/commerce-policy";
import { liveOrderable } from "../live-catalog";
import { AddToCart } from "../Shop";
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
  const [mobileOpen,setMobileOpen]=useState(false);
  const count=cartCount(useCart());
  return <header className="v32-header">
    <nav className="v32-nav" aria-label="3L Visual Lab">
      <button className="v32-mobile-toggle" type="button" aria-label={mobileOpen?"Close navigation":"Open navigation"}
        aria-controls="v32-mobile-links" aria-expanded={mobileOpen} onClick={()=>setMobileOpen(value=>!value)}>☰</button>
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
    {mobileOpen&&<nav className="v32-mobile-drawer" id="v32-mobile-links" aria-label="Mobile navigation">
      <a href={origin}>HOME</a><a href={origin+"/menu"}>Menu</a>
      <a href={origin+"/#journal"}>JOURNAL</a><a href="/contact">Contact</a>
    </nav>}
  </header>;
}
function Home(){
  return <main className="v32-home v32-home-fidelity" id="main">
    <h1>More than a cake.<br/>A family tradition.</h1>
    <section className="v32-journey" aria-label="Mexico City 1982 to Dubai Today">
      <div className="v32-city v32-city-left"><div className="v32-city-crop"><img src="/brand/reference/mexico-dubai.png" alt="Mexico City 1982 illustration"/></div>
        <b>MEXICO CITY</b><span>1982</span></div>
      <svg viewBox="0 0 540 100" className="v32-route" aria-hidden="true">
        <path d="M8 39 C90 -24 150 138 267 55 S417 56 529 38" fill="none" stroke="#b98a4e" strokeWidth="2"/>
        <circle cx="98" cy="37" r="17" fill="none" stroke="#b98a4e" strokeWidth="2"/>
        <circle cx="529" cy="38" r="9" fill="#f8ebe4" stroke="#b98a4e" strokeWidth="3"/>
      </svg>
      <div className="v32-city v32-city-right"><div className="v32-city-crop"><img src="/brand/reference/mexico-dubai.png" alt="Dubai Today illustration"/></div>
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
  return <main className="v32-landing v32-landing-fidelity" id="main">
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
  const menu=useMenu();
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
  const [sku,setSku]=useState<string|null>(allowed[0]?.id??null);
  const chosen=allowed.find(o=>o.id===sku)??allowed[0];
  const [place,setPlace]=useState<CSSProperties>({left:12,top:12,maxHeight:"calc(100dvh - 24px)"});
  const [side,setSide]=useState<"right"|"left"|"overlap"|"mobile"|"mobile-compact">("mobile");
  const panel=useRef<HTMLDivElement>(null);
  const closeButton=useRef<HTMLButtonElement>(null);
  useLayoutEffect(()=>{
    const recalc=()=>{
      const w=window.innerWidth,h=Math.round(window.visualViewport?.height??window.innerHeight);
      const r=anchor?.getBoundingClientRect(),pw=Math.min(490,w-24),ph=Math.min(650,h-24);
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
    <div ref={panel} className="v32-popup" data-anchor-side={side}
      role="dialog" aria-modal="true" aria-label={product.title} style={place}>
      <div className="v32-popup-scroll">
        <div className="v32-popup-heading">
          <div><h2>{product.title}</h2>{product.description&&<p>{product.description}</p>}</div>
          <button ref={closeButton} type="button" className="v32-close"
            aria-label="Close" onClick={onClose}>×</button>
        </div>
        <p className="v32-section-caption">CHOOSE A VARIANT</p>
        <div className="v32-variants" role="group" aria-label="Choose a variant">
          {allowed.map(o=><button key={o.id} type="button" className={o.id===chosen?.id?"v32-variant v32-variant-current":"v32-variant"}
            aria-pressed={o.id===chosen?.id} onClick={()=>setSku(o.id)}>
            <span>{o.size}</span><small>{formatAed(o.priceFils)}</small>
          </button>)}
        </div>
        {chosen&&<div className="v32-popup-unit">
          <p className="v32-section-caption">PRICE</p>
          <strong className="b-menu-price">{formatAed(chosen.priceFils)}</strong>
        </div>}
        {!chosen&&!loading&&<p role="status">Online ordering is unavailable for this product.</p>}
      </div>
      <div className="v32-popup-footer b-menu-options">
        {chosen?<AddToCart key={chosen.id} productId={chosen.id}
          fallback={<p role="status">Online ordering is unavailable for this variant.</p>}/>:
          <button disabled type="button">ADD TO CART · UNAVAILABLE</button>}
      </div>
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
  return <main className="v32-catalog v32-catalog-fidelity" id="main">
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
