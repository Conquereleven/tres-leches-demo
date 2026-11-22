import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { cart, cartCount, cartSubtotalFils, displayLinePrice, minQty, MAX_QTY, useCart, useCheckoutConfig, type CheckoutConfig } from "../cart";
import { useLanguage } from "../localization";
import { formatAed } from "../content";
import { business, phoneHref, policyDecisions, type PolicyPath } from "../business";
import { lineKey, packSpec, componentName, type Composition } from "../../../shared/pack-composition";
import { menuFamilyForSku } from "../menu";
import { packQtyLabel, toPackChoice } from "./catalog-options";
import { tricolorCopy, tricolorSpec, TRICOLOR_COLORS, type TricolorColor } from "../../../shared/tricolor";

const root="/visual-v32";
const copy={
 en:{empty:"Your basket is waiting for something delicious.",cart:"Your basket",continue:"Explore our menu",checkout:"Checkout",remove:"Remove",total:"Subtotal",quantity:"Quantity",delivery:"Delivery",pickup:"Pickup",fulfillment:"Delivery or pickup",details:"Your details",review:"Review your order",next:"Continue",back:"Back",date:"Choose a date",slot:"Time window",zone:"Delivery area",address:"Street and building",unit:"Apartment / unit",first:"Full name",phone:"Phone number",email:"Email",notice:"This isolated preview does not take payments. Your order is not placed.",notReady:"Ordering is temporarily unavailable.",minimum:"Minimum purchase requirements must be met before checkout.",contact:"We're here to help",contactIntro:"Questions about your order, delivery or a custom cake? Reach our 3L team.",company:"Company",location:"Visit us",help:"How to order",helpText:"Select your cake or bakery items, choose pickup or delivery, and review your details before payment.",price:"Price",add:"Add to cart",choose:"Choose one",selection:"Select a color",boxes:"Choose the pieces in each box",pieces:"Pieces selected",invalid:"Please complete the selections to continue.",saved:"Added to cart",start:"Continue shopping",policy:"Customer information",verify:"Delivery fee and minimum are verified by our server.",retry:"Try again"},
 es:{empty:"Tu carrito espera algo delicioso.",cart:"Tu carrito",continue:"Explora nuestro menú",checkout:"Finalizar pedido",remove:"Eliminar",total:"Subtotal",quantity:"Cantidad",delivery:"Entrega",pickup:"Recoger",fulfillment:"Entrega o recogida",details:"Tus datos",review:"Revisa tu pedido",next:"Continuar",back:"Volver",date:"Elige una fecha",slot:"Horario",zone:"Zona de entrega",address:"Calle y edificio",unit:"Apartamento / unidad",first:"Nombre completo",phone:"Teléfono",email:"Correo electrónico",notice:"Esta vista de prueba no acepta pagos ni crea pedidos.",notReady:"Los pedidos no están disponibles temporalmente.",minimum:"Debes completar los mínimos antes del checkout.",contact:"Estamos para ayudarte",contactIntro:"¿Preguntas sobre tu pedido, entrega o un pastel especial? Contacta al equipo 3L.",company:"Empresa",location:"Visítanos",help:"Cómo ordenar",helpText:"Elige tus productos, selecciona entrega o recogida y revisa los datos antes del pago.",price:"Precio",add:"Añadir al carrito",choose:"Elige uno",selection:"Elige un color",boxes:"Elige las piezas de cada caja",pieces:"Piezas seleccionadas",invalid:"Completa tu selección para continuar.",saved:"Añadido al carrito",start:"Seguir comprando",policy:"Información al cliente",verify:"El cargo y el mínimo de entrega los valida nuestro servidor.",retry:"Reintentar"},
 ar:{empty:"سلتك تنتظر شيئاً لذيذاً.",cart:"سلتك",continue:"استكشف قائمتنا",checkout:"إتمام الطلب",remove:"إزالة",total:"المجموع الفرعي",quantity:"الكمية",delivery:"توصيل",pickup:"استلام",fulfillment:"توصيل أو استلام",details:"بياناتك",review:"مراجعة طلبك",next:"متابعة",back:"رجوع",date:"اختر التاريخ",slot:"الفترة",zone:"منطقة التوصيل",address:"الشارع والمبنى",unit:"الوحدة",first:"الاسم الكامل",phone:"رقم الهاتف",email:"البريد الإلكتروني",notice:"هذه معاينة تجريبية لا تنفّذ الدفع أو الطلبات.",notReady:"الطلب غير متاح مؤقتاً.",minimum:"يجب استيفاء الحد الأدنى قبل متابعة الطلب.",contact:"نحن هنا للمساعدة",contactIntro:"هل لديك أسئلة حول طلبك أو التوصيل أو كعكة خاصة؟ تواصل مع فريق 3L.",company:"الشركة",location:"زورونا",help:"كيفية الطلب",helpText:"اختر المنتجات والتوصيل أو الاستلام وراجع التفاصيل قبل الدفع.",price:"السعر",add:"أضف إلى السلة",choose:"اختر",selection:"اختر اللون",boxes:"اختر محتويات كل علبة",pieces:"عدد القطع",invalid:"أكمل الاختيار للمتابعة.",saved:"تمت الإضافة",start:"متابعة التسوق",policy:"معلومات العملاء",verify:"يتم التحقق من الرسوم والحد الأدنى بواسطة الخادم.",retry:"حاول مجدداً"}
} as const;
const suffix=(p:string)=>root+p;
const money=(n:number)=>formatAed(n);
function useVisualCopy(){const {language}=useLanguage();return {language,t:copy[language]};}
function Panel({title,children}:{title:string;children:React.ReactNode}){return <section className="v32-new-panel"><h2>{title}</h2>{children}</section>;}
function Empty({message}:{message:string}){return <div className="v32-new-empty"><p>{message}</p><a className="v32-new-action" href={suffix("/bakery")}>{copy.en.continue} ↗</a></div>;}
function Summary({config}:{config:CheckoutConfig}){
 const lines=useCart();const {language,t}=useVisualCopy();
 const good=lines.filter(l=>config.products.some(p=>p.id===l.productId));
 return <aside className="v32-new-summary"><h2>{t.cart} · {cartCount(lines)}</h2>
 <ul>{good.map(l=>{const p=config.products.find(p=>p.id===l.productId)!;return <li key={lineKey(l)}><span>{p.name}<small> × {l.quantity}</small>
  {(()=>{const option=menuFamilyForSku(l.productId)?.options.find(o=>o.id===l.productId);
    const choice=option?toPackChoice(option):null;
    return choice&&choice.pieces>1?<small data-cart-pack-count>
      {packQtyLabel(choice.pieces,language)} · {l.quantity} × {choice.pieces} = {l.quantity*choice.pieces} {language==="es"?"piezas":language==="ar"?"قطع":"pieces"}
    </small>:null;})()}
  </span><strong>{money(displayLinePrice(l,p.priceFils,config.packPricing)*l.quantity)}</strong></li>})}</ul>
 <div className="v32-new-total"><span>{t.total}</span><strong>{money(cartSubtotalFils(good,config.products,config.packPricing))}</strong></div></aside>;
}
export function VisualCart(){
 const {t}=useVisualCopy();const lines=useCart();const {config,loading,retry}=useCheckoutConfig();
 return <main id="main" className="v32-new-page" data-new-ui="cart">
 <p className="v32-new-eyebrow">THE 3L EXPERIENCE</p><h1>{t.cart}</h1>
 {loading?<p role="status">Loading…</p>:!config?<div role="alert">{t.notReady}<button onClick={retry}>{t.retry}</button></div>:
 !lines.length?<Empty message={t.empty}/>:<div className="v32-new-layout">
 <Panel title={t.cart}><ul className="v32-new-cart-items">{lines.map(l=>{const p=config.products.find(x=>x.id===l.productId);return <li key={lineKey(l)} className="v32-new-cart-row">
  <div><h3>{p?.name||l.productId}</h3>{l.color&&<p>{tricolorCopy.en[l.color]}</p>}{l.composition?.map(c=><small key={c.componentSkuId}>{componentName(c.componentSkuId)} × {c.units} </small>)}
  <p>{p?money(displayLinePrice(l,p.priceFils,config.packPricing))+" each":t.notReady}</p></div>
  <div className="v32-new-cart-controls"><label>{t.quantity}<input type="number" min={minQty(l.productId)} max="100" value={l.quantity} onChange={e=>cart.set(lineKey(l),Number(e.target.value))}/></label><button type="button" onClick={()=>cart.remove(lineKey(l))}>{t.remove}</button></div></li>})}</ul>
 <a className="v32-new-action v32-new-action-secondary" href={suffix("/bakery")}>{t.continue}</a></Panel>
 <div><Summary config={config}/><a className="v32-new-action" href={suffix("/checkout")}>{t.checkout} →</a></div></div>}
 </main>;
}
export function VisualContact(){
 const {t}=useVisualCopy();
 return <main className="v32-new-page v32-new-contact" id="main" data-new-ui="contact">
 <p className="v32-new-eyebrow">CUSTOMER CARE</p><h1>{t.contact}</h1><p className="v32-new-lead">{t.contactIntro}</p>
 <div className="v32-new-contact-grid">{business.supportContacts.map(c=><a key={c.name} className="v32-new-panel v32-new-contact-card" href={phoneHref(c.phone)}><small>{c.name}</small><strong>{c.phone}</strong><span>↗</span></a>)}</div>
 <Panel title={t.location}><p>{business.legalName} · {business.tradingName}</p><address>{business.address}</address></Panel>
 </main>;
}
export function VisualHowToOrder(){const {t}=useVisualCopy();return <main className="v32-new-page" id="main" data-new-ui="how"><p className="v32-new-eyebrow">3L PASTELERÍAS</p><h1>{t.help}</h1><div className="v32-new-layout"><Panel title={t.help}><p>{t.helpText}</p><p>{t.verify}</p></Panel><Panel title={t.contact}><p>{t.contactIntro}</p><a href={suffix("/contact")} className="v32-new-action">{t.contact} →</a></Panel></div></main>;}
const policyNames:Record<Exclude<PolicyPath,"/contact">,string>={
 "/terms":"Terms & Conditions","/privacy":"Privacy Policy","/refund-policy":"Refund & Cancellation","/delivery-policy":"Delivery Policy"
};
export function VisualPolicy({path}:{path:PolicyPath}){
 const {t}=useVisualCopy();const title=path==="/contact"?t.contact:policyNames[path];if(path==="/contact")return <VisualContact/>;
 return <main id="main" className="v32-new-page" data-new-ui="policy"><p className="v32-new-eyebrow">{t.policy}</p><h1>{title}</h1>
 <div className="v32-new-policy"><Panel title={title}>
 {path==="/terms"&&<><p>{business.tradingName} operates in {business.city}, {business.country}, under {business.legalName}.</p><p>Orders are confirmed only after payment verification. The official cart, delivery fee and minimum values are validated by the 3L server.</p></>}
 {path==="/privacy"&&<><p>Customer information is requested only as needed to process and support an order. Payment card details are handled by {business.paymentProcessor} on its hosted secure checkout, not in this visual preview.</p><p>Contact our team for questions about your information.</p></>}
 {path==="/refund-policy"&&<><p>Paid cancellations: {policyDecisions.paidCancellationWindow}.</p><p>Eligible refunds: {policyDecisions.paidCancellationRefund}.</p><p>Other damage, delivery and product concerns are reviewed by the team; no unconfirmed deadline is implied.</p></>}
 {path==="/delivery-policy"&&<><p>Delivery area and minimum order depend on server-verified zones in Dubai. Order totals and delivery charges are checked before payment.</p><p>Delivery dates and availability are confirmed in checkout, not guaranteed by this visual preview.</p></>}
 <p>Last updated: {business.policiesUpdated}.</p></Panel>
 <a href={suffix("/contact")} className="v32-new-action">{t.contact} →</a></div></main>;
}
type Quote={eligible?:boolean;totalFils?:number;subtotalFils?:number;feeFils?:number;minOrderAed?:number;reason?:string};
export function VisualCheckout(){
 const {t}=useVisualCopy();const lines=useCart();const {config,loading,retry}=useCheckoutConfig();
 const [step,setStep]=useState(1),[mode,setMode]=useState<"pickup"|"delivery">("pickup");
 const [zone,setZone]=useState(""),[date,setDate]=useState(""),[slot,setSlot]=useState("");
 const [name,setName]=useState(""),[phone,setPhone]=useState(""),[email,setEmail]=useState("");
 const [address,setAddress]=useState(""),[unit,setUnit]=useState("");
 const [quote,setQuote]=useState<Quote|null>(null),[quoteError,setQuoteError]=useState(""),[busy,setBusy]=useState(false);
 const validLines=useMemo(()=>config?lines.filter(l=>config.products.some(p=>p.id===l.productId)):[],[lines,config]);
 const below=validLines.some(l=>l.quantity<minQty(l.productId));
 useEffect(()=>{
  let active=true;setQuote(null);setQuoteError("");
  if(!config?.enabled||!validLines.length||mode==="delivery"&&!zone)return;
  setBusy(true);
  fetch("/api/checkout/quote",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({lines:validLines,...(mode==="pickup"?{fulfillmentMethod:"pickup"}:{zoneId:zone})})})
   .then(async r=>{if(!r.ok)throw Error("Quote unavailable");return r.json() as Promise<Quote>})
   .then(q=>{if(active)setQuote(q)}).catch(()=>{if(active)setQuoteError(t.notReady)}).finally(()=>{if(active)setBusy(false)});
  return()=>{active=false};
 },[config,validLines,mode,zone,t.notReady]);
 const proceed=(e:FormEvent)=>{e.preventDefault();if(step===1&&(!date||!slot||(mode==="delivery"&&(!zone||!address))))return;
  if(step===2&&(!name.trim()||!phone.trim()||!email.includes("@")))return;setStep(s=>Math.min(3,s+1));window.scrollTo({top:0,behavior:"smooth"})};
 return <main id="main" className="v32-new-page" data-new-ui="checkout"><p className="v32-new-eyebrow">THE 3L EXPERIENCE</p><h1>{step===1?t.fulfillment:step===2?t.details:t.review}</h1>
 <div className="v32-new-progress"><span className={step>=1?"active":""}>01 {t.fulfillment}</span><span className={step>=2?"active":""}>02 {t.details}</span><span className={step>=3?"active":""}>03 {t.review}</span></div>
 {loading?<p role="status">Loading…</p>:!config?.enabled?<div role="alert">{t.notReady}<button type="button" onClick={retry}>{t.retry}</button></div>:
 !validLines.length?<Empty message={t.empty}/>:below?<div role="alert" className="v32-new-panel">{t.minimum}<a className="v32-new-action" href={suffix("/cart")}>{t.cart}</a></div>:
 <div className="v32-new-layout"><form onSubmit={proceed} className="v32-new-panel v32-new-form">
 {step===1&&<><h2>{t.fulfillment}</h2><div className="v32-new-switch"><button type="button" className={mode==="pickup"?"active":""} onClick={()=>setMode("pickup")}>{t.pickup}</button><button type="button" className={mode==="delivery"?"active":""} onClick={()=>setMode("delivery")}>{t.delivery}</button></div>
 {mode==="delivery"&&<><label>{t.zone}<select required value={zone} onChange={e=>setZone(e.target.value)}><option value="">{t.choose}</option>{config.zones.map(z=><option key={z.id} value={z.id}>{z.name}</option>)}</select></label><label>{t.address}<input required value={address} onChange={e=>setAddress(e.target.value)}/></label><label>{t.unit}<input value={unit} onChange={e=>setUnit(e.target.value)}/></label></>}
 <div className="v32-new-fields"><label>{t.date}<input required type="date" min={config.dates.min} max={config.dates.max} value={date} onChange={e=>setDate(e.target.value)}/></label><label>{t.slot}<select required value={slot} onChange={e=>setSlot(e.target.value)}><option value="">{t.choose}</option>{config.slots.map(x=><option key={x} value={x}>{x}</option>)}</select></label></div>
 </>}
 {step===2&&<><h2>{t.details}</h2><label>{t.first}<input required autoComplete="name" value={name} onChange={e=>setName(e.target.value)}/></label><div className="v32-new-fields"><label>{t.phone}<input required type="tel" autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)}/></label><label>{t.email}<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label></div></>}
 {step===3&&<><h2>{t.review}</h2><p><strong>{name}</strong> · {phone} · {email}</p><p>{mode==="pickup"?business.address:address+" · "+unit}</p><p>{date} · {slot}</p><div role="status" className="v32-new-payment-block">{t.notice}</div></>}
 <div className="v32-new-steps">{step>1&&<button type="button" className="v32-new-action-secondary" onClick={()=>setStep(x=>x-1)}>{t.back}</button>}{step<3&&<button className="v32-new-action" type="submit" disabled={busy||!quote?.eligible}>{t.next} →</button>}</div>
 </form><div><Summary config={config}/><div role="status" className="v32-new-quote">{busy?"Checking delivery…":quoteError||(!quote?.eligible?"Please select an eligible area / pickup.":("Total (server quote): "+money(quote.totalFils||0)))}</div><p className="v32-new-footnote">{t.verify}</p></div></div>}
 </main>;
}
export function VisualReturn(){const {t}=useVisualCopy();return <main className="v32-new-page" id="main" data-new-ui="return"><p className="v32-new-eyebrow">3L · CUSTOMER CARE</p><h1>{t.checkout}</h1><div className="v32-new-panel"><p>{t.notice}</p><p>This preview cannot confirm a payment. If you have an existing real order, do not pay again to check its status. Please contact 3L support.</p><a className="v32-new-action" href={suffix("/contact")}>{t.contact}</a></div></main>;}

export function VisualAddToCart({productId,onAdded,controlsTarget,desktopQtyTarget}:{
 productId:string;onAdded:()=>void;controlsTarget:HTMLDivElement|null;desktopQtyTarget:HTMLDivElement|null;
}){
 const {language,t}=useVisualCopy();
 const {config,loading}=useCheckoutConfig();
 const lines=useCart();
 const product=config?.products.find(p=>p.id===productId);
 const spec=packSpec(productId),tricolor=tricolorSpec(productId);
 const [qty,setQty]=useState(minQty(productId));
 const [note,setNote]=useState("");
 const [color,setColor]=useState<TricolorColor|null>(null);
 const [composition,setComposition]=useState<Composition>([]);
 const inCart=lines.filter(l=>l.productId===productId).reduce((sum,l)=>sum+l.quantity,0);
 const allowedPack=spec&&config?.personalizedPacks?.enabled&&config.personalizedPacks.rules.some(rule=>rule.packSkuId===productId);
 const cap=spec?.capacity||0;const picked=composition.reduce((sum,x)=>sum+x.units,0);
 const publishedRule=config?.personalizedPacks?.rules.find(rule=>rule.packSkuId===productId);
 const custom=!!spec&&!!config?.personalizedPacks?.enabled;
 const valid=!custom||!!allowedPack&&!!publishedRule&&picked===cap&&
   composition.every(piece=>publishedRule.componentSkuIds.includes(piece.componentSkuId));
 const amount=product?displayLinePrice({productId,quantity:qty,...(custom?{composition}:{})},product.priceFils,config?.packPricing)*qty:Number.NaN;
 const amountValid=Number.isFinite(amount)&&amount>=0;
 const canAdd=!!config?.enabled&&!!product&&!loading&&valid&&amountValid&&note.trim().length===0&&
   (!tricolor||tricolor.kind==="fixed"||!!color)&&inCart+qty<=MAX_QTY;
 // Variant changes preserve the visual note, as in the original ProductPopup.
 useEffect(()=>{setQty(minQty(productId));setColor(null);setComposition([]);},[productId]);
 const add=()=>{if(!canAdd)return;cart.add(productId,qty,custom?composition:undefined,color||undefined);onAdded();};
 const choose=(id:string,delta:number)=>setComposition(old=>{
   const units=Math.max(0,Math.min(cap,(old.find(x=>x.componentSkuId===id)?.units||0)+delta));
   const other=old.filter(x=>x.componentSkuId!==id);
   return units?[...other,{componentSkuId:id,units}]:other;
 });
 const noteLabel=language==="es"?"PERSONALIZACIÓN (OPCIONAL)":language==="ar"?"تخصيص (اختياري)":"PERSONALIZATION (OPTIONAL)";
 const placeholder=language==="es"?'Ej. "Feliz cumpleaños"':language==="ar"?"أضف ملاحظة (40 حرفاً)":"Add a note (e.g. no sugar, gift message…)";
 const catalogOption=menuFamilyForSku(productId)?.options.find(o=>o.id===productId);
 const packChoice=catalogOption?toPackChoice(catalogOption):null;
 const quantityLabel=packChoice&&packChoice.pieces>1
   ?language==="es"?"Número de cajas":language==="ar"?"عدد العلب":"Number of boxes"
   :t.quantity;
 const quantityControl=(kind:"mobile"|"desktop")=><div className={"v32-buy-qty v32-buy-qty-"+kind} role="group" aria-label={quantityLabel}>
   <button type="button" aria-label="Decrease quantity" disabled={qty<=minQty(productId)} onClick={()=>setQty(n=>Math.max(minQty(productId),n-1))}>−</button>
   <output aria-live="polite">{qty}</output>
   <button type="button" aria-label="Increase quantity" disabled={qty+inCart>=MAX_QTY} onClick={()=>setQty(n=>n+1)}>+</button>
 </div>;
 const controls=<div className="v32-config-fields" data-source-component="ProductPopup">
   {tricolor?.kind==="single"&&<label className="v32-config-extra">{t.selection}<select value={color||""} onChange={e=>setColor(e.target.value as TricolorColor)}><option value="">{t.choose}</option>{TRICOLOR_COLORS.map(c=><option key={c} value={c}>{tricolorCopy[language][c]}</option>)}</select></label>}
   {custom&&<div className="v32-new-pack"><p>{t.boxes} · {t.pieces}: {picked}/{cap}</p>{allowedPack?spec!.components.filter(piece=>publishedRule?.componentSkuIds.includes(piece.componentSkuId)).map(c=><div key={c.componentSkuId}><span>{componentName(c.componentSkuId,language)}</span><button type="button" aria-label="Decrease selection" onClick={()=>choose(c.componentSkuId,-1)}>−</button><span>{composition.find(x=>x.componentSkuId===c.componentSkuId)?.units||0}</span><button type="button" aria-label="Increase selection" disabled={picked>=cap} onClick={()=>choose(c.componentSkuId,1)}>+</button></div>):<p role="alert">{t.notReady}</p>}</div>}
   <div className="v32-buy-row">
     <div className="v32-buy-price"><span>{t.price}</span><strong>{amountValid?money(amount):t.notReady}</strong></div>
     {quantityControl("mobile")}
   </div>
   <div className="v32-personalization">
     <label htmlFor="v32-product-note">{noteLabel}</label>
     <div className="v32-personalization-field">
       <span aria-hidden="true" className="v32-pencil">✎</span>
       <input id="v32-product-note" value={note} maxLength={40}
          onChange={e=>setNote(e.target.value.slice(0,40))}
          aria-describedby="v32-note-disclaimer" placeholder={placeholder}/>
       <output aria-live="polite">{note.length}/40</output>
     </div>
     <span className={note.trim()?"v32-note-warning":"v32-sr"} id="v32-note-disclaimer">
    {language==="es"?"La personalización aún no se envía a cocina. Borra la nota para continuar.":language==="ar"?"هذه الملاحظة غير متاحة للطلب بعد؛ امسحها للمتابعة.":"Personalization is not yet sent to the kitchen. Clear the note to continue."}
   </span>
   </div>
 </div>;
 return <>
   {controlsTarget?createPortal(controls,controlsTarget):null}
   {desktopQtyTarget?createPortal(quantityControl("desktop"),desktopQtyTarget):null}
   <div className="v32-buy-form" data-new-ui="add-to-cart">
     <button className="v32-buy-cta" type="button" disabled={!canAdd} onClick={add}>
       <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M5 8h14l-1 12H6z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></svg>
       <span className="v32-buy-cta-label">{t.add}</span>
       <span className="v32-buy-cta-price">{amountValid?" · "+money(amount):"—"}</span>
       <span className="v32-buy-cta-arrow" aria-hidden="true">→</span>
     </button>
     {!valid&&<small role="alert">{t.invalid}</small>}
   </div>
 </>;
}
