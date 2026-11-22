/**
 * SOURCE-LOCKED VisualLab V3.2 purchase component.
 * DOM hierarchy and colors rebuilt from ZIP:
 * src/components/ProductPopup.jsx + ProductCard.jsx and REF_C/REF_D.
 * Only SKU/pricing/availability/cart adapters originate from 3L Commerce.
 * No old storefront view or legacy v32 modal styling is mounted.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useMenu, menuProductFamily, type StorefrontProduct } from "../menu";
import { useCheckoutConfig, useCheckoutNow, useCart, cart, displayLinePrice, minQty, MAX_QTY } from "../cart";
import { useLanguage } from "../localization";
import { availableSku } from "../../../shared/commerce-policy";
import { liveOrderable } from "../live-catalog";
import { selectedProductMedia, publishedMediaAuthority } from "../media";
import { formatAed } from "../content";
import { packChoices, packQtyLabel, presentationLabel, toPackChoice } from "./catalog-options";
import { packSpec, componentName, type Composition } from "../../../shared/pack-composition";
import { tricolorSpec, TRICOLOR_COLORS, tricolorCopy, type TricolorColor } from "../../../shared/tricolor";
import "./approved-source.css";

const words={
 es:{variant:"Variante",presentation:"Presentación",price:"Precio",quantity:"Cantidad",boxes:"Cantidad de cajas",note:"Personalización",optional:"(opcional)",placeholder:'Ej. "Feliz cumpleaños"',add:"Agregar al carrito",unavailable:"No disponible",notReady:"Selecciona todos los sabores antes de continuar",noteHold:"La personalización todavía no llega a cocina. Borra la nota para continuar.",pieces:"piezas por caja",unit:"pieza",close:"Cerrar",min:"Pedido mínimo",select:"Seleccionar color",contains:"Contenido de la caja"},
 en:{variant:"Choose a variant",presentation:"Presentation",price:"Price",quantity:"Quantity",boxes:"Number of boxes",note:"Personalization",optional:"(optional)",placeholder:"e.g. Happy birthday",add:"Add to cart",unavailable:"Unavailable",notReady:"Select every flavor before continuing",noteHold:"Personalization is not yet delivered to the kitchen. Clear the note to continue.",pieces:"pieces per box",unit:"piece",close:"Close",min:"Minimum order",select:"Select color",contains:"Pieces in box"},
 ar:{variant:"اختر النوع",presentation:"الحجم",price:"السعر",quantity:"الكمية",boxes:"عدد العلب",note:"التخصيص",optional:"(اختياري)",placeholder:"مثلاً عيد ميلاد سعيد",add:"أضف إلى السلة",unavailable:"غير متاح",notReady:"اختر الأصناف للمتابعة",noteHold:"لا يمكن إرسال الملاحظة إلى المطبخ حالياً. امسحها للمتابعة.",pieces:"قطع في العلبة",unit:"قطعة",close:"إغلاق",min:"الحد الأدنى للطلب",select:"اختر اللون",contains:"القطع في العلبة"}
} as const;
type AnchorSide="left"|"right"|"overlap"|"mobile"|"compact";
type AnchorPlace=CSSProperties&{left:number;top:number;width:number;maxHeight:number};

export function ApprovedProductCard({product,familyId,variant,price,active,onSelect}:{
 product:StorefrontProduct;familyId:string;variant:string;price:number|null;
 active:boolean;onSelect:(element:HTMLButtonElement)=>void;
}){
 const {language}=useLanguage();
 const menu=useMenu();
 const family=menu.families.find(f=>f.id===familyId);
 const media=selectedProductMedia(product.id,familyId,variant);
 const url=media?.derivatives.find(d=>d.format==="webp")?.src??media?.derivatives[0]?.src
  ??(!publishedMediaAuthority()?family?.image:null);
 return <button className={"ref32-product"+(active?" ref32-product-active":"")} type="button"
   data-product-id={product.id} data-category-id={family?.category??""}
   data-selected-product={active} aria-haspopup="dialog" aria-expanded={active}
   disabled={price===null} onClick={event=>onSelect(event.currentTarget)}>
   <span className="ref32-photo">
     {url?<img src={url} alt={product.title} loading="lazy"/>:
       <span className="ref32-photo-pending" role="img" aria-label={product.title+" — photograph pending"}>
         <strong>✧ 3L</strong><small>{language==="es"?"Fotografía pendiente":language==="ar"?"الصورة قيد الإعداد":"Photo pending"}</small>
       </span>}
     <span className={"ref32-card-mark"+(active?" ref32-card-mark-selected":"")} aria-hidden="true">
       {active?<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="m4 12 5 5L20 6"/></svg>:
       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M20.8 8.1c0 4-5 7.4-8.8 10.9C8.2 15.5 3.2 12.1 3.2 8.1c0-4 5.2-5.8 8.8-2.2 3.6-3.6 8.8 2.2z"/></svg>}
     </span>
   </span>
   <span className="ref32-product-copy">
     <strong>{product.title}</strong>
     {product.description&&<em>{product.description}</em>}
     <span className="ref32-product-bottom"><span>{price===null?words[language].unavailable:
       (language==="es"?"Desde ":"From ")+formatAed(price)}</span>
       <span className="ref32-product-arrow" aria-hidden="true">→</span>
     </span>
   </span>
 </button>;
}
export function ApprovedPurchasePopup({product,anchor,onClose,onAdded}:{
 product:StorefrontProduct;anchor:HTMLElement|null;onClose:()=>void;onAdded:()=>void;
}){
 const {language}=useLanguage();const t=words[language];
 const menu=useMenu();const family=menuProductFamily(menu,product);
 const {config,loading}=useCheckoutConfig();const now=useCheckoutNow(config);
 const lines=useCart();
 const allowed=family.options.filter(option=>{
  const record=config?.products.find(p=>p.id===option.id);
  return availableSku(option.id,now)&&!!record&&record.priceFils===option.priceFils&&
    (menu.status!=="live"||liveOrderable(option.id)===true);
 });
 const grouped=packChoices(allowed);
 const sorted=[...allowed].sort((a,b)=>toPackChoice(a).pieces-toPackChoice(b).pieces||
  (toPackChoice(a).presentation==="mini"?-1:toPackChoice(b).presentation==="mini"?1:0));
 const initial=sorted[0]?.id??"";
 const [sku,setSku]=useState(initial);
 const [qty,setQty]=useState(initial?minQty(initial):1);
 const [note,setNote]=useState("");
 const [color,setColor]=useState<TricolorColor|null>(null);
 const [composition,setComposition]=useState<Composition>([]);
 const chosen=allowed.find(o=>o.id===sku)??sorted[0];
 const productId=chosen?.id??"";
 const selected=chosen?toPackChoice(chosen):null;
 const [presentation,setPresentation]=useState(selected?.presentation??"");
 // Checkout config/live catalog are asynchronous. Initial state can be empty:
 // synchronize the chosen SKU and presentation when authoritative options arrive.
 const availableKey=allowed.map(option=>option.id).join("|");
 useEffect(()=>{
  if(!allowed.length)return;
  const first=sorted[0]!;
  setSku(current=>allowed.some(option=>option.id===current)?current:first.id);
  setPresentation(current=>grouped?.presentations.includes(current)?current:toPackChoice(first).presentation);
  setQty(current=>Math.max(current,minQty(first.id)));
 },[availableKey,product.id]);
 const spec=packSpec(productId),tricolor=tricolorSpec(productId);
 const configured=config?.products.find(p=>p.id===productId);
 const personalizedRule=config?.personalizedPacks?.rules.find(rule=>rule.packSkuId===productId);
 const customized=!!spec&&!!config?.personalizedPacks?.enabled;
 const count=spec?.capacity??0,picked=composition.reduce((sum,p)=>sum+p.units,0);
 const packValid=!customized||!!personalizedRule&&picked===count&&
  composition.every(p=>personalizedRule.componentSkuIds.includes(p.componentSkuId));
 const inCart=lines.filter(l=>l.productId===productId).reduce((sum,l)=>sum+l.quantity,0);
 const unit=configured?displayLinePrice({productId,quantity:qty,...(customized?{composition}:{})},configured.priceFils,config?.packPricing):NaN;
 const total=unit*qty;
 const canBuy=!!config?.enabled&&!loading&&!!configured&&
  packValid&&Number.isFinite(total)&&total>=0&&qty>=minQty(productId)&&
  inCart+qty<=MAX_QTY&&note.trim().length===0&&
  (!tricolor||tricolor.kind==="fixed"||!!color);
 const [place,setPlace]=useState<AnchorPlace>({left:12,top:12,width:420,maxHeight:600});
 const [side,setSide]=useState<AnchorSide>("right");
 const dialog=useRef<HTMLElement>(null);const closeControl=useRef<HTMLButtonElement>(null);
 const amount=Number.isFinite(total)?formatAed(total):"—";
 const chooseSku=(id:string)=>{
  setSku(id);setQty(minQty(id));setComposition([]);setColor(null);
  const option=allowed.find(o=>o.id===id);if(option)setPresentation(toPackChoice(option).presentation);
 };
 const selectedOption=(style:string,pieces:number)=>
  grouped?.choices.find(x=>x.presentation===style&&x.pieces===pieces);
 const chooseFlavor=(id:string,delta:number)=>setComposition(old=>{
  const value=Math.min(count,Math.max(0,(old.find(x=>x.componentSkuId===id)?.units??0)+delta));
  const rest=old.filter(x=>x.componentSkuId!==id);
  return value?[...rest,{componentSkuId:id,units:value}]:rest;
 });
 const quantityControls=<div className="ref32-quantity" role="group"
   aria-label={selected&&selected.pieces>1?t.boxes:t.quantity}>
   <button type="button" aria-label="Decrease quantity" disabled={qty<=minQty(productId)}
     onClick={()=>setQty(q=>Math.max(minQty(productId),q-1))}>−</button>
   <output aria-live="polite">{qty}</output>
   <button type="button" aria-label="Increase quantity" disabled={inCart+qty>=MAX_QTY}
     onClick={()=>setQty(q=>q+1)}>+</button>
 </div>;
 const buy=()=>{if(!canBuy)return;cart.add(productId,qty,customized?composition:undefined,color??undefined);onAdded();};
 useLayoutEffect(()=>{
  const measure=()=>{
   const viewportWidth=window.innerWidth;
   const height=Math.round(window.visualViewport?.height??window.innerHeight);
   const bounds=anchor?.getBoundingClientRect();
   if(viewportWidth<=640){
    const compact=height<=720;
    const width=Math.min(viewportWidth-24,410);
    const imageBottom=anchor?.querySelector(".ref32-photo")?.getBoundingClientRect().bottom;
    const wanted=compact?Math.max(12,Math.min(54,Math.round((height-540)/2))):
       (imageBottom??bounds?.top??20)-5;
    const top=compact?wanted:Math.max(12,Math.min(wanted,height-430));
    setPlace({left:Math.round((viewportWidth-width)/2),top,width,maxHeight:height-top-12});
    setSide(compact?"compact":"mobile");return;
   }
   const width=Math.min(448,viewportWidth-24);
   const br=bounds??{left:12,right:260,top:100};
   const right=br.right+width+8<=viewportWidth;
   const left=!right&&br.left-width-8>=12;
   const position=right?"right":left?"left":"overlap";
   const x=right?br.right+6:left?br.left-width-6:Math.max(12,Math.min(viewportWidth-width-12,br.right-width*.35));
   const maxHeight=Math.min(610,height-32);
   // Align to the actual dialog height, not the allowed 610px cap.
   // Otherwise a 440px dialog jumps 170px above the selected card.
   const renderedHeight=Math.min(maxHeight,Math.max(360,dialog.current?.offsetHeight??480));
   setPlace({left:x,top:Math.max(12,Math.min(br.top-12,height-renderedHeight-12)),width,maxHeight});
   setSide(position);
  };
  measure();window.addEventListener("resize",measure);window.addEventListener("scroll",measure,true);
  window.visualViewport?.addEventListener("resize",measure);
  return ()=>{window.removeEventListener("resize",measure);window.removeEventListener("scroll",measure,true);
   window.visualViewport?.removeEventListener("resize",measure);};
 },[anchor,product.id]);
 useEffect(()=>{
  const before=document.body.style.overflow;document.body.style.overflow="hidden";
  const raf=requestAnimationFrame(()=>closeControl.current?.focus());
  const onKey=(event:KeyboardEvent)=>{
   if(event.key==="Escape"){event.preventDefault();onClose();}
   if(event.key!=="Tab"||!dialog.current)return;
   const tabbables=Array.from(dialog.current.querySelectorAll<HTMLElement>(
    'button:not([disabled]),input:not([disabled]),select:not([disabled])'));
   const first=tabbables[0],last=tabbables.at(-1);
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  };
  window.addEventListener("keydown",onKey);
  return ()=>{cancelAnimationFrame(raf);document.body.style.overflow=before;window.removeEventListener("keydown",onKey);};
 },[onClose]);
 return createPortal(<div className="ref32-overlay">
  <button type="button" className="ref32-backdrop" tabIndex={-1} aria-label="Close purchase dialog" onClick={onClose}/>
  <section className="ref32-dialog" ref={dialog} role="dialog" aria-modal="true"
    data-anchor-side={side} data-selected-sku={productId} style={place} aria-label={family.name}>
   <div className="ref32-details">
    <header className="ref32-dialog-heading">
     <div><h2>{family.name.replace(/\s*[·–—-]\s*Pack\b.*$/i,"")}</h2>
      {product.description&&<p>{product.description}</p>}</div>
     <button className="ref32-close" type="button" ref={closeControl} aria-label="Close" onClick={onClose}>×</button>
    </header>
    <p className="ref32-section-label">{t.variant}</p>
    {grouped?.choices.length===4?
      <div className="ref32-options ref32-options-four" role="group" aria-label={t.variant}>
       {[...grouped.choices].sort((a,b)=>a.pieces-b.pieces||
         ((a.presentation==="mini"?0:1)-(b.presentation==="mini"?0:1))).map(choice=>
        <button type="button" key={choice.option.id} data-sku={choice.option.id}
         data-pack-pieces={choice.pieces} aria-pressed={productId===choice.option.id}
         className={productId===choice.option.id?"ref32-option ref32-option-active":"ref32-option"}
         onClick={()=>chooseSku(choice.option.id)}>
         <span>{packQtyLabel(choice.pieces,language)}
           {choice.presentation==="mini"?" (Mini)":choice.presentation==="individual"?" (Individual)":""}</span>
         <small>{formatAed(choice.option.priceFils)}</small>
        </button>)}
      </div>:
    grouped?.choices.length&&grouped.choices.length>4?
      <div className="ref32-composed-variants">
       <div className="ref32-presentation" role="group" aria-label={t.presentation}>
        {grouped.presentations.map(name=><button type="button" key={name} data-pack-presentation={name}
          aria-pressed={presentation===name} onClick={()=>{
            const next=selectedOption(name,selected?.pieces??1)??grouped.choices.find(x=>x.presentation===name);
            if(next)chooseSku(next.option.id);
          }}>{presentationLabel(name,language)}</button>)}
       </div>
       <div className="ref32-options ref32-options-three" role="group" aria-label={t.variant}>
        {grouped.quantities.map(pieces=>{
         const option=selectedOption(presentation,pieces);
         return <button type="button" key={pieces} data-pack-pieces={pieces}
          aria-pressed={option?.option.id===productId}
          className={option?.option.id===productId?"ref32-option ref32-option-active":"ref32-option"}
          disabled={!option} onClick={()=>option&&chooseSku(option.option.id)}>
          <span>{packQtyLabel(pieces,language)}</span><small>{option?formatAed(option.option.priceFils):"—"}</small>
         </button>;
        })}
       </div>
      </div>:
      <div className="ref32-options ref32-options-four" role="group" aria-label={t.variant}>
       {sorted.map(option=><button type="button" key={option.id} data-sku={option.id}
         aria-pressed={option.id===productId}
         className={option.id===productId?"ref32-option ref32-option-active":"ref32-option"}
         onClick={()=>chooseSku(option.id)}>
         <span>{option.size}</span><small>{formatAed(option.priceFils)}</small>
       </button>)}
      </div>}
    {tricolor?.kind==="single"&&<label className="ref32-extra">{t.select}
      <select value={color??""} onChange={e=>setColor(e.target.value as TricolorColor)}>
       <option value="">—</option>{TRICOLOR_COLORS.map(item=><option value={item} key={item}>{tricolorCopy[language][item]}</option>)}
      </select>
     </label>}
    {customized&&<div className="ref32-composition">
      <p>{t.contains}: {picked}/{count}</p>
      {spec?.components.filter(x=>personalizedRule?.componentSkuIds.includes(x.componentSkuId)).map(x=>
       <div className="ref32-composition-row" key={x.componentSkuId}><span>{componentName(x.componentSkuId,language)}</span>
        <button type="button" onClick={()=>chooseFlavor(x.componentSkuId,-1)}>−</button>
        <output>{composition.find(y=>y.componentSkuId===x.componentSkuId)?.units??0}</output>
        <button type="button" disabled={picked>=count} onClick={()=>chooseFlavor(x.componentSkuId,1)}>+</button>
       </div>)}
    </div>}
    <div className="ref32-price-quantity">
     <div className="ref32-price"><span>{t.price}</span><strong>{amount}</strong></div>
     {quantityControls}
    </div>
    {minQty(productId)>1&&<p className="ref32-min" data-minimum-notice>{t.min}: {minQty(productId)} {t.unit}</p>}
    {selected&&selected.pieces>1&&<p className="ref32-count" data-pack-piece-count>{selected.pieces} {t.pieces}</p>}
    <label className="ref32-note"><span>{t.note} <em>{t.optional}</em></span>
      <span className="ref32-note-field"><span aria-hidden="true">✎</span>
       <input value={note} maxLength={40} aria-label={t.note} placeholder={t.placeholder}
        onChange={e=>setNote(e.target.value.slice(0,40))}/>
       <output aria-live="polite">{note.length}/40</output>
      </span>
    </label>
    {note.trim()&&<p role="alert" className="ref32-note-warning">{t.noteHold}</p>}
    {!packValid&&<p role="alert" className="ref32-note-warning">{t.notReady}</p>}
   </div>
   <footer className="ref32-dialog-footer">
     <div className="ref32-desktop-quantity">{quantityControls}</div>
     <button type="button" className="ref32-buy" disabled={!canBuy} onClick={buy}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M5 8h14l-1 12H6z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></svg>
      <span>{t.add}</span><span className="ref32-cta-cost">{amount}</span><span className="ref32-cta-arrow" aria-hidden="true">→</span>
     </button>
   </footer>
  </section>
 </div>,document.body);
}
