/* Commercial purchase state with the approved VR008 contextual presentation. */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useMenu, menuProductFamily, type MenuOption, type StorefrontProduct } from "../menu";
import { useCheckoutConfig, useCheckoutNow, useCart, cart, displayLinePrice, minQty, skuQuantityLimit } from "../cart";
import { useLanguage, type Locale } from "../localization";
import { useLiveCatalog, type LiveState } from "../live-catalog";
import { purchasableOptions } from "./catalog-availability";
import { MediaPicture, MediaRotation, productGalleryMedia, selectedProductMedia, publishedMediaAuthority } from "../media";
import { formatAed } from "../content";
import { localizedMoney, localizedSource } from "../locales/engine";
import { cakeSizeForSku, cakeSizeName, cakeServingCopy, validCakeMessage } from "../../../shared/cake-personalization";
import { packChoices, packQtyLabel, presentationLabel, toPackChoice } from "./catalog-options";
import { packSpec, componentName, type Composition } from "../../../shared/pack-composition";
import { tricolorSpec, TRICOLOR_COLORS, tricolorCopy, type TricolorColor } from "../../../shared/tricolor";
import "./approved-source.css";

const words={
 es:{size:"Tamaño",variant:"Variante",presentation:"Presentación",price:"Precio",quantity:"Cantidad",boxes:"Cantidad de cajas",note:"Personalización",optional:"(opcional)",placeholder:'Ej. "Feliz cumpleaños"',add:"Agregar al carrito",unavailable:"No disponible",notReady:"Selecciona todos los sabores antes de continuar",noteHold:"La inscripción supera el límite del tamaño seleccionado.",pieces:"piezas por caja",unit:"pieza",close:"Cerrar",min:"Pedido mínimo",select:"Seleccionar color",contains:"Contenido de la caja",decrease:"Reducir cantidad",increase:"Aumentar cantidad",fullSizePhoto:"Foto del tamaño Normal"},
 en:{size:"Size",variant:"Choose a variant",presentation:"Presentation",price:"Price",quantity:"Quantity",boxes:"Number of boxes",note:"Personalization",optional:"(optional)",placeholder:"e.g. Happy birthday",add:"Add to cart",unavailable:"Unavailable",notReady:"Select every flavor before continuing",noteHold:"The inscription exceeds the character limit for this size.",pieces:"pieces per box",unit:"piece",close:"Close",min:"Minimum order",select:"Select color",contains:"Pieces in box",decrease:"Decrease quantity",increase:"Increase quantity",fullSizePhoto:"Photo shows the Normal size"},
 ar:{size:"الحجم",variant:"اختر النوع",presentation:"الحجم",price:"السعر",quantity:"الكمية",boxes:"عدد العلب",note:"التخصيص",optional:"(اختياري)",placeholder:"مثلاً عيد ميلاد سعيد",add:"أضف إلى السلة",unavailable:"غير متاح",notReady:"اختر الأصناف للمتابعة",noteHold:"الكتابة تتجاوز الحد المسموح لهذا الحجم.",pieces:"قطع في العلبة",unit:"قطعة",close:"إغلاق",min:"الحد الأدنى للطلب",select:"اختر اللون",contains:"محتويات العلبة",decrease:"تقليل الكمية",increase:"زيادة الكمية",fullSizePhoto:"الصورة للحجم العادي"}
} as const;

export const storefrontMoney = (amount: number, language: Locale) =>
 language === "ar" ? localizedMoney(amount, language) : formatAed(amount);

function publishedProduct(product: StorefrontProduct, catalog: LiveState) {
 return catalog.status === "live" ? catalog.catalog.products.find(entry => entry.id === product.id) : undefined;
}

export function productTitle(product: StorefrontProduct, language: Locale, catalog: LiveState, text: (source: string) => string) {
 return publishedProduct(product,catalog)?.content[language]?.name ?? (language==="en"?product.title:text(product.title));
}
export function productDescription(product: StorefrontProduct, language: Locale, catalog: LiveState) {
 return publishedProduct(product,catalog)?.content[language]?.description ??
   (product.description ? localizedSource(product.description, language) : null);
}

export function useProductTitle(product: StorefrontProduct) {
 const {language,text}=useLanguage();
 return productTitle(product,language,useLiveCatalog(),text);
}

export function ApprovedProductCard({product,familyId,variant,price,active,onSelect,children,gallery=false,detailsHref}:{
 product:StorefrontProduct;familyId:string;variant:string;price:number|null;
 active:boolean;onSelect:(element:HTMLButtonElement)=>void;children?:ReactNode;gallery?:boolean;detailsHref?:string;
}){
 const {language}=useLanguage();
 const title=useProductTitle(product);
 const published=useLiveCatalog();
 const description=productDescription(product,language,published);
 const menu=useMenu();
 const family=menu.families.find(f=>f.id===familyId);
 const media=selectedProductMedia(product.id,familyId,variant);
 const additional=gallery&&media?productGalleryMedia(product.id,familyId,variant):[];
 const [photoHeld,setPhotoHeld]=useState(false);
 const [failedFallback,setFailedFallback]=useState<string|null>(null);
 const sizes="(max-width:599px) 46vw, (max-width:1099px) 30vw, 22vw";
 const fallback=publishedMediaAuthority()?null:family?.image;
 const category=family?.category;
 const feature=category==="pan"?" tile-pan":category==="conchas"?" tile-conchas":category==="panettone"?" tile-panettone":category==="cakes"?" tile-cake":/oreja/i.test(product.slug)?" tile-orejas":"";
 const showWholePhoto=category==="panettone"||product.id==="111";
 const body=<>
   <span className="ref32-photo tile-photo" data-fit={showWholePhoto?"whole":undefined}>
     {media&&additional.length?<MediaRotation key={media.sourceId} frames={[media,...additional]} alt=""
       className="product-media" sizes={sizes} focusable={false} paused={active||photoHeld}/>:
       media?<MediaPicture key={media.sourceId} asset={media} alt="" className="product-media" sizes={sizes} placeholderOnError/>:
       fallback&&fallback!==failedFallback?<img className="product-media" src={fallback} alt="" loading="lazy" decoding="async"
         onError={()=>setFailedFallback(fallback)}/>:
       <span className="ref32-photo-pending" role="img" aria-label={title}>
         <strong>✧ 3L</strong><small>{language==="es"?"Fotografía pendiente":language==="ar"?"الصورة قيد الإعداد":"Photo pending"}</small>
       </span>}
     {active&&<span className="picked" aria-hidden="true"><svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m4 12 5 5L20 6"/></svg></span>}
   </span>
   <span className="tile-copy ref32-product-copy">
     <strong>{title}</strong>
     {description&&<em>{description}</em>}
     <span>{price===null?words[language].unavailable:
       (language==="es"?"Desde ":language==="ar"?"ابتداءً من ":"From ")+storefrontMoney(price,language)}</span>
     <i aria-hidden="true">→</i>
   </span>
 </>;
 const attributes={className:"ref32-product tile-button","data-product-id":product.id,"data-category-id":family?.category??""};
 return <><article className={"tile"+feature+(active?" is-selected":"")}>
   {detailsHref?<a {...attributes} href={detailsHref}>{body}</a>:
    <button {...attributes} type="button" data-selected-product={active} aria-haspopup="dialog" aria-expanded={active}
      aria-controls={active?"product-panel":undefined} disabled={price===null} onClick={event=>onSelect(event.currentTarget)}
      onFocus={gallery?()=>setPhotoHeld(true):undefined} onBlur={gallery?()=>setPhotoHeld(false):undefined}>{body}</button>}
 </article>{children}</>;
}

export function ApprovedPurchasePopup({product,anchor,onClose,onAdded}:{
 product:StorefrontProduct;anchor:HTMLElement|null;onClose:()=>void;onAdded:()=>void;
}){
 const {language}=useLanguage();const t=words[language];
 const menu=useMenu();
 const {config,loading}=useCheckoutConfig();const now=useCheckoutNow(config);
 const [variantId,setVariantId]=useState(product.id);
 const category=menuProductFamily(menu,product).category;
 const optionsFor=(item:StorefrontProduct)=>purchasableOptions(menuProductFamily(menu,item),menu.status,config,now);
 const panettone=category==="panettone";
 const variants=category==="pan"||panettone
  ? menu.products.filter(item=>item.familyId===product.familyId&&(panettone||optionsFor(item).length>0))
  : [];
 const current=variants.find(item=>item.id===variantId)??product;
 const family=menuProductFamily(menu,current);
 const lines=useCart();
 const title=useProductTitle(current);
 const published=useLiveCatalog();
 const description=productDescription(current,language,published);
 const allowed=optionsFor(current);
 const grouped=packChoices(allowed);
 const liveOptions=publishedProduct(current,published)?.options;
 const hasMultipleFlavors=new Set(allowed.map(item=>item.variant)).size>1;
 const localizedOption=(option:MenuOption,source:string)=>{
  const content=liveOptions?.find(item=>item.id===option.id)?.content[language];
  const cakeLabels={Mini:{es:"Mini",ar:"صغير جداً"},Small:{es:"Pequeño",ar:"صغير"},Medium:{es:"Mediano",ar:"متوسط"}};
  const size=cakeLabels[source as keyof typeof cakeLabels];
  const label=content?.sizeLabel??(language==="en"?source:size?size[language]:localizedSource(source,language));
  const flavor=hasMultipleFlavors&&option.variant?(content?.variantLabel??localizedSource(option.variant,language)):null;
  return flavor&&flavor!==label?`${flavor} · ${label}`:label;
 };
 const cakeSizing=family.category==="cakes" && allowed.length>0 &&
   allowed.every(option=>cakeSizeForSku(option.id)!==null);
 const showSize=cakeSizing||panettone;
 const rank={mini:0,small:1,medium:2};
 const sorted=[...(panettone?family.options:allowed)].sort((a,b)=>{
  if(cakeSizing) return rank[cakeSizeForSku(a.id)!.key]-rank[cakeSizeForSku(b.id)!.key];
  return toPackChoice(a).pieces-toPackChoice(b).pieces||
   (toPackChoice(a).presentation==="mini"?-1:toPackChoice(b).presentation==="mini"?1:0);
 });
 const firstAvailable=sorted.find(option=>allowed.some(item=>item.id===option.id));
 const initial=firstAvailable?.id??"";
 const [sku,setSku]=useState(initial);
 const [qty,setQty]=useState(initial?minQty(initial):1);
 const [note,setNote]=useState("");
 const [color,setColor]=useState<TricolorColor|null>(null);
 const [composition,setComposition]=useState<Composition>([]);
 const chosen=allowed.find(o=>o.id===sku)??firstAvailable;
 const variantPhoto=panettone?selectedProductMedia(current.id,family.id,current.variant,chosen?.size):undefined;
 const productId=chosen?.id??"";
 const selected=chosen?toPackChoice(chosen):null;
 const activeCake=cakeSizing?cakeSizeForSku(productId):null;
 const serving=activeCake?cakeServingCopy(activeCake,language):null;
 const noteTooLong=!!activeCake&&note.trim().length>activeCake.maxCharacters;
 const [presentation,setPresentation]=useState(selected?.presentation??"");
 // A catalog refresh can withdraw the selected size while the popup is open.
 // Reset its preparation choices before offering the remaining size.
 const availableKey=allowed.map(option=>option.id).join("|");
 useEffect(()=>{
  if(sku===productId || !productId)return;
  setSku(productId);setQty(minQty(productId));setComposition([]);setColor(null);setNote("");
  setPresentation(selected?.presentation??"");
 },[availableKey,sku,productId,selected?.presentation]);
 const spec=packSpec(productId),tricolor=tricolorSpec(productId);
 const configured=config?.products.find(p=>p.id===productId);
 const personalizedRule=config?.personalizedPacks?.rules.find(rule=>rule.packSkuId===productId);
 const customized=!!spec&&!!config?.personalizedPacks?.enabled;
 const count=spec?.capacity??0,picked=composition.reduce((sum,p)=>sum+p.units,0);
 const packValid=!customized||!!personalizedRule&&picked===count&&
  composition.every(p=>personalizedRule.componentSkuIds.includes(p.componentSkuId));
 const inCart=lines.filter(l=>l.productId===productId).reduce((sum,l)=>sum+l.quantity,0);
 const quantityLimit=skuQuantityLimit(productId)??Number.MAX_SAFE_INTEGER;
 const unit=configured?displayLinePrice({productId,quantity:qty,...(customized?{composition}:{})},configured.priceFils,config?.packPricing):NaN;
 const total=unit*qty;
 const canBuy=!!config?.enabled&&!loading&&!!configured&&
  sku===productId&&packValid&&Number.isFinite(total)&&total>=0&&qty>=minQty(productId)&&
  inCart+qty<=quantityLimit&&(!note.trim()||!!activeCake&&validCakeMessage(productId,note.trim()))&&
  (!tricolor||tricolor.kind==="fixed"||!!color);
 const dialog=useRef<HTMLElement>(null);const closeControl=useRef<HTMLButtonElement>(null);
 const amount=Number.isFinite(total)?storefrontMoney(total,language):"—";
 const chooseSku=(option:MenuOption)=>{
  setSku(option.id);setQty(minQty(option.id));setComposition([]);setColor(null);
  setPresentation(toPackChoice(option).presentation);
 };
 const chooseVariant=(item:StorefrontProduct,options:MenuOption[])=>{
  setVariantId(item.id);setNote("");
  if(panettone){
   const next=options.find(option=>option.size===chosen?.size)??options.find(option=>toPackChoice(option).presentation==="mini")??options[0];
   if(next)chooseSku(next);
  }
 };
 const selectedOption=(style:string,pieces:number)=>
  grouped?.choices.find(x=>x.presentation===style&&x.pieces===pieces);
 const chooseFlavor=(id:string,delta:number)=>setComposition(old=>{
  const value=Math.min(count,Math.max(0,(old.find(x=>x.componentSkuId===id)?.units??0)+delta));
  const rest=old.filter(x=>x.componentSkuId!==id);
  return value?[...rest,{componentSkuId:id,units:value}]:rest;
 });
 const quantityControls=<div className="ref32-quantity quantity" role="group"
   aria-label={selected&&selected.pieces>1?t.boxes:t.quantity}>
   <button type="button" aria-label={t.decrease} disabled={qty<=minQty(productId)}
     onClick={()=>setQty(q=>Math.max(minQty(productId),q-1))}>−</button>
   <output aria-live="polite">{qty}</output>
   <button type="button" aria-label={t.increase} disabled={inCart+qty>=quantityLimit}
     onClick={()=>setQty(q=>q+1)}>+</button>
 </div>;
 const buy=()=>{if(!canBuy)return;cart.add(productId,qty,customized?composition:undefined,color??undefined,note.trim()||undefined);onAdded();};
 useLayoutEffect(()=>{
  const element=dialog.current;
  const grid=element?.parentElement;
  if(!element||!grid||!anchor)return;
  const scrollArea=grid.closest<HTMLElement>(".catalog-products")??grid;
  let verticalSide: "above" | "below" | undefined;
  let widthMeasured=0, heightMeasured=0;
  const place=()=>{
   const bounds=grid.getBoundingClientRect(),card=anchor.getBoundingClientRect();
   const panel=element.getBoundingClientRect();
   const viewport=window.visualViewport;
   const top=viewport?.offsetTop??0, height=viewport?.height??window.innerHeight;
   const compact=window.matchMedia("(max-width: 1023px)").matches;
   const gap=12;
   const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
   const cardCenter=card.left+card.width/2-bounds.left;
   let x:number,y:number;
   if(compact){
    const above=card.top-top,below=top+height-card.bottom;
    const fitsAbove=card.top-bounds.top>=panel.height+gap;
    if(!verticalSide||widthMeasured!==bounds.width||heightMeasured!==height)
     verticalSide=fitsAbove&&below<panel.height+gap&&above>below?"above":"below";
    else if(verticalSide==="above"&&!fitsAbove)verticalSide="below";
    x=clamp(cardCenter-panel.width/2,0,bounds.width-panel.width);
    y=(verticalSide==="above"?card.top-panel.height-gap:card.bottom+gap)-bounds.top;
    element.dataset.placement=verticalSide;
    element.dataset.anchorSide=verticalSide;
    element.style.setProperty("--pointer-x",`${clamp(cardCenter-x,14,panel.width-14)}px`);
   }else{
    const leftSpace=card.left-bounds.left,rightSpace=bounds.right-card.right;
    const right=rightSpace>=leftSpace;
    x=clamp((right?card.right-gap/2:card.left-panel.width+gap/2)-bounds.left,0,bounds.width-panel.width);
    y=Math.max(0,card.top-bounds.top-10);
    element.dataset.placement="side";
    element.dataset.side=right?"right":"left";
    element.dataset.anchorSide=right?"right":"left";
   }
   widthMeasured=bounds.width;heightMeasured=height;
   element.style.setProperty("--panel-x",`${x}px`);
   element.style.setProperty("--panel-y",`${y}px`);
   scrollArea.style.setProperty("--panel-overhang",`${Math.max(0,y+panel.height-bounds.height)}px`);
  };
  place();
  const observer=new ResizeObserver(place);
  for(const node of [grid,anchor,element])observer.observe(node);
  window.addEventListener("resize",place);
  window.visualViewport?.addEventListener("resize",place);
  const frame=requestAnimationFrame(()=>{
   closeControl.current?.focus({preventScroll:true});
   closeControl.current?.scrollIntoView({block:"nearest"});
  });
  return ()=>{
   cancelAnimationFrame(frame);observer.disconnect();
   window.removeEventListener("resize",place);
   window.visualViewport?.removeEventListener("resize",place);
   scrollArea.style.removeProperty("--panel-overhang");
  };
 },[anchor,product.id]);
 useEffect(()=>{
  const key=(event:KeyboardEvent)=>{
   if(event.key==="Escape"){event.preventDefault();onClose();}
  };
  const dismiss=(event:PointerEvent)=>{
   if(event.target instanceof Element&&!dialog.current?.contains(event.target)&&!event.target.closest(".ref32-product"))onClose();
  };
  window.addEventListener("keydown",key);
  window.addEventListener("pointerdown",dismiss);
  return ()=>{window.removeEventListener("keydown",key);window.removeEventListener("pointerdown",dismiss);};
 },[onClose]);
 return <section className="ref32-dialog config glass" id="product-panel" ref={dialog} role="dialog" lang={language} dir={language==="ar"?"rtl":"ltr"}
    data-selected-sku={productId} data-product-id={product.id} data-variant-product-id={current.id} aria-label={title}>
   <div className="ref32-details">
    <div className={"ref32-dialog-heading"+(variantPhoto?" ref32-panettone-intro":"")}>
     <div>
      <h2>{title}</h2>
      {description&&<p className="config-description">{description}</p>}
      {serving&&<p className="ref32-servings" data-cake-serves>{serving}</p>}
     </div>
     {variantPhoto&&<figure className="ref32-panettone-figure">
       <MediaPicture key={variantPhoto.sourceId} asset={variantPhoto} alt="" className="ref32-panettone-preview" sizes="90px"/>
       {selected?.presentation==="mini"&&<figcaption>{t.fullSizePhoto}</figcaption>}
     </figure>}
     <button className="ref32-close close-config" type="button" ref={closeControl} aria-label={t.close} onClick={onClose}>×</button>
    </div>
    {variants.length>1&&<>
      <p className="ref32-section-label">{t.variant}</p>
      <div className="ref32-options ref32-options-three" role="group" aria-label={t.variant}>
        {variants.map(item=>{
          const content=publishedProduct(item,published)?.options[0]?.content[language];
          const label=content?.variantLabel??localizedSource(item.variant,language);
          const active=item.id===current.id;
          const options=panettone?optionsFor(item):[];
          return <button type="button" key={item.id} data-variant-id={item.id} aria-pressed={active}
            disabled={panettone&&options.length===0}
            className={active?"ref32-option ref32-option-active":"ref32-option"}
            onClick={()=>chooseVariant(item,options)}>
            <span>{label}</span>
          </button>;
        })}
      </div>
    </>}
    <p className="ref32-section-label">{showSize||variants.length>1?t.size:t.variant}</p>
    {grouped?.choices.length===4?
      <div className="ref32-options ref32-options-four" role="group" aria-label={t.variant}>
       {[...grouped.choices].sort((a,b)=>a.pieces-b.pieces||
         ((a.presentation==="mini"?0:1)-(b.presentation==="mini"?0:1))).map(choice=>
        <button type="button" key={choice.option.id} data-sku={choice.option.id}
         data-pack-pieces={choice.pieces} aria-pressed={productId===choice.option.id}
         className={productId===choice.option.id?"ref32-option ref32-option-active":"ref32-option"}
         onClick={()=>chooseSku(choice.option)}>
         <span>{packQtyLabel(choice.pieces,language)}
           {["mini","individual"].includes(choice.presentation)?` (${presentationLabel(choice.presentation,language)})`:""}</span>
         <small>{storefrontMoney(choice.option.priceFils,language)}</small>
        </button>)}
      </div>:
    grouped?.choices.length&&grouped.choices.length>4?
      <div className="ref32-composed-variants">
       <div className="ref32-presentation" role="group" aria-label={t.presentation}>
        {grouped.presentations.map(name=><button type="button" key={name} data-pack-presentation={name}
          aria-pressed={presentation===name} onClick={()=>{
            const next=selectedOption(name,selected?.pieces??1)??grouped.choices.find(x=>x.presentation===name);
            if(next)chooseSku(next.option);
          }}>{presentationLabel(name,language)}</button>)}
       </div>
       <div className="ref32-options ref32-options-three" role="group" aria-label={t.variant}>
        {grouped.quantities.map(pieces=>{
         const option=selectedOption(presentation,pieces);
         return <button type="button" key={pieces} data-pack-pieces={pieces}
          aria-pressed={option?.option.id===productId}
          className={option?.option.id===productId?"ref32-option ref32-option-active":"ref32-option"}
          disabled={!option} onClick={()=>option&&chooseSku(option.option)}>
          <span>{packQtyLabel(pieces,language)}</span><small>{option?storefrontMoney(option.option.priceFils,language):"—"}</small>
         </button>;
        })}
       </div>
      </div>:
      <div className={"ref32-options "+(panettone?"ref32-options-two":cakeSizing&&sorted.length===3?"ref32-options-three":"ref32-options-four")} role="group" aria-label={showSize||variants.length>1?t.size:t.variant} data-cake-sizes={cakeSizing?"Mini-Small-Medium":undefined}>
       {sorted.map(option=><button type="button" key={option.id} data-sku={option.id}
         aria-pressed={option.id===productId}
         className={option.id===productId?"ref32-option ref32-option-active":"ref32-option"}
         disabled={panettone&&!allowed.some(item=>item.id===option.id)}
         onClick={()=>chooseSku(option)}>
         <span>{localizedOption(option,cakeSizing?cakeSizeName(cakeSizeForSku(option.id)!):option.size)}</span>
         <small>{storefrontMoney(option.priceFils,language)}</small>
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
    {minQty(productId)>1&&<p className="ref32-min minimum" data-minimum-notice>{t.min}: <bdi>{new Intl.NumberFormat(language==="ar"?"ar-AE-u-nu-arab":language).format(minQty(productId))}</bdi> {language==="ar"?"قطع":language==="es"?"piezas":"pieces"}</p>}
    {selected&&selected.pieces>1&&<p className="ref32-count" data-pack-piece-count>{selected.pieces} {t.pieces}</p>}
    {activeCake&&<label className="ref32-note"><span>{t.note} <em>{t.optional}</em></span>
      <span className="ref32-note-field"><span aria-hidden="true">✎</span>
       <input value={note} maxLength={activeCake.maxCharacters} aria-label={t.note} placeholder={t.placeholder}
        onChange={e=>setNote(e.target.value.slice(0,activeCake.maxCharacters))}/>
       <output aria-live="polite" data-cake-message-count>{note.length}/{activeCake.maxCharacters}</output>
      </span>
    </label>}
    {noteTooLong&&<p role="alert" className="ref32-note-warning">{t.noteHold}</p>}
    {!packValid&&<p role="alert" className="ref32-note-warning">{t.notReady}</p>}
    <div className="ref32-price-quantity config-bottom">
     <div className="ref32-price config-price"><span>{t.price}</span><strong><bdi>{amount}</bdi></strong></div>
     <div className="qty-block"><span>{selected&&selected.pieces>1?t.boxes:t.quantity}</span>{quantityControls}</div>
    </div>
   </div>
   <footer className="ref32-dialog-footer">
     <button type="button" className="ref32-buy add" disabled={!canBuy} onClick={buy}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M5 8h14l-1 12H6z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></svg>
      <span>{t.add}</span><span className="ref32-cta-arrow" aria-hidden="true">{language==="ar"?"←":"→"}</span>
     </button>
   </footer>
  </section>;
}
