import { useEffect, useMemo, useState, type FormEvent } from "react";
import { cart, cartCount, cartSubtotalFils, displayLinePrice, minQty, useCart, useCheckoutConfig, type CartLine, type CheckoutConfig } from "../cart";
import { useLanguage } from "../localization";
import { withdrawnConchaSku } from "../../../shared/storefront-visibility";
import { formatAed } from "../content";
import { business, contactChannelLabel, contactChannels, legalEntityLabel, type PolicyPath } from "../business";
import { pages } from "../Policies";
import { HowToOrderSteps } from "../StorePages";
import { lineKey, componentName, packSpec, type Composition } from "../../../shared/pack-composition";
import { menuFamilyForSku } from "../menu";
import { packQtyLabel, toPackChoice } from "./catalog-options";
import { isTricolorColor, tricolorSpec, tricolorCopy, TRICOLOR_COLORS } from "../../../shared/tricolor";
import { packCopy } from "../../../shared/pack-copy";
import { PackBuilder, packComplete } from "../PackBuilder";

// In canonical V3.2, cart actions go to the existing REAL /checkout.
// The /visual-v32 preview stays isolated and payment-free.
const root = typeof location !== "undefined" && location.pathname.startsWith("/visual-v32")
  ? "/visual-v32" : "";
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
 const good=lines.filter(l=>!withdrawnConchaSku(l.productId)&&config.products.some(p=>p.id===l.productId));
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
// Canonical V3.2 cart pack editing. Reuses the exact commercial primitives of
// the classic cart (PackBuilder UI, packComplete gating, cart.edit identity):
// the line key stays stable, quantities/prices/server quotes are untouched.
function V32PackEditor({line,config}:{line:CartLine;config:CheckoutConfig}){
 const {language}=useLanguage();const copy=packCopy(language);
 const [value,setValue]=useState<Composition>(line.composition??[]);
 return <details className="v32-new-pack-edit">
  <summary>{copy.edit}</summary>
  <PackBuilder productId={line.productId} config={config} value={value} onChange={setValue}/>
  <button type="button" className="v32-new-action-secondary" disabled={!packComplete(line.productId,value,config)} onClick={()=>cart.edit(lineKey(line),value)}>{copy.save}</button>
 </details>;
}
// Tricolor single-piece color editing, same primitive as the classic cart
// (cart.editColor with line-key identity and merge on identical lines).
function V32TricolorEditor({line}:{line:CartLine}){
 const {language}=useLanguage();
 return <label className="v32-new-tricolor">{tricolorCopy[language].color}
  <select required value={line.color??""} onChange={e=>{if(isTricolorColor(e.target.value))cart.editColor(lineKey(line),e.target.value);}}>
   <option value="">{tricolorCopy[language].choose}</option>
   {TRICOLOR_COLORS.map(c=><option key={c} value={c}>{tricolorCopy[language][c]}</option>)}
  </select>
 </label>;
}
export function VisualCart(){
 const {text}=useLanguage();
 const {t}=useVisualCopy();
 const lines=useCart();const {config,loading,retry}=useCheckoutConfig();
 const needsReview=lines.some(l=>withdrawnConchaSku(l.productId));
 return <main id="main" className="v32-new-page" data-new-ui="cart">
 <p className="v32-new-eyebrow">THE 3L EXPERIENCE</p><h1>{t.cart}</h1>
 {loading?<p role="status">Loading…</p>:!config?<div role="alert">{t.notReady}<button onClick={retry}>{t.retry}</button></div>:
 !lines.length?<Empty message={t.empty}/>:<div className="v32-new-layout">
 <Panel title={t.cart}><ul className="v32-new-cart-items">{lines.map(l=>{const p=withdrawnConchaSku(l.productId)?undefined:config.products.find(x=>x.id===l.productId);return <li key={lineKey(l)} className="v32-new-cart-row">
  <div><h3>{p?.name||l.productId}</h3>{p&&tricolorSpec(l.productId)?.kind==="single"?<V32TricolorEditor line={l}/>:l.color&&<p>{tricolorCopy.en[l.color]}</p>}{l.cakeMessage&&<p data-cart-cake-message>{t.selection==="Select a color"?"Cake inscription":"Inscripción"}: {l.cakeMessage}</p>}{l.composition?.map(c=><small key={c.componentSkuId}>{componentName(c.componentSkuId)} × {c.units} </small>)}{p&&config.personalizedPacks?.enabled&&packSpec(l.productId)&&<V32PackEditor line={l} config={config}/>}
  <p>{p?money(displayLinePrice(l,p.priceFils,config.packPricing))+" each":text("This item is no longer available.")}</p></div>
  <div className="v32-new-cart-controls">{p&&<label>{t.quantity}<input type="number" min={minQty(l.productId)} max="100" value={l.quantity} onChange={e=>cart.set(lineKey(l),Number(e.target.value))}/></label>}<button type="button" onClick={()=>cart.remove(lineKey(l))}>{t.remove}</button></div></li>})}</ul>
 <a className="v32-new-action v32-new-action-secondary" href={suffix("/bakery")}>{t.continue}</a></Panel>
 <div><Summary config={config}/>{needsReview?<p role="alert">{text("This item is no longer available.")}</p>:<a className="v32-new-action" href={suffix("/checkout")}>{t.checkout} →</a>}</div></div>}
 </main>;
}
export function VisualContact(){
 const {language,t}=useVisualCopy();
 return <main className="v32-new-page v32-new-contact" id="main" data-new-ui="contact">
 <p className="v32-new-eyebrow">CUSTOMER CARE</p><h1>{t.contact}</h1><p className="v32-new-lead">{t.contactIntro}</p>
 <div className="v32-new-contact-grid">{contactChannels().map(c=><a key={c.href} className="v32-new-panel v32-new-contact-card" href={c.href} {...(c.kind==="whatsapp"?{target:"_blank",rel:"noopener noreferrer"}:{})}><small>{contactChannelLabel(c,language)}</small>{" "}<strong><bdi dir="ltr">{c.value}</bdi></strong><span aria-hidden="true">↗</span></a>)}</div>
 <Panel title={t.location}><p>{business.legalName} · {business.tradingName}</p><address>{business.address}</address></Panel>
 </main>;
}
export function VisualHowToOrder(){
 const {t}=useVisualCopy();
 const {config}=useCheckoutConfig();
 return <main className="v32-new-page" id="main" data-new-ui="how">
  <p className="v32-new-eyebrow">3L PASTELERÍAS</p><h1>{t.help}</h1>
  <div className="v32-new-layout">
   <Panel title={t.help}><HowToOrderSteps addressVerificationRequired={config?.addressVerificationRequired}/><p>{t.verify}</p></Panel>
   <Panel title={t.contact}><p>{t.contactIntro}</p><a href={suffix("/contact")} className="v32-new-action">{t.contact} →</a></Panel>
  </div>
 </main>;
}
export function VisualPolicy({path}:{path:PolicyPath}){
 // The V3.2 shell owns only frame/navigation. Every legal sentence below is
 // the authorized commercial copy from src/brand/Policies.tsx (single source
 // of truth with business.ts): never preview-simplified text.
 const {t}=useVisualCopy();const {language}=useLanguage();
 if(path==="/contact")return <VisualContact/>;
 const page=pages[path];
 useEffect(()=>{document.title=`${page.metaTitle} — ${business.tradingName} Dubai`;},[page]);
 return <main id="main" className="v32-new-page" data-new-ui="policy"><p className="v32-new-eyebrow">{t.policy}</p><h1>{page.title}</h1>
 <div className="v32-new-policy b-policy-body">{page.intro}
 {page.summary&&<ul className="b-policy-summary" aria-label="Summary">{page.summary.map(s=><li key={s.title}><p className="b-label">{s.title}</p><p>{s.text}</p></li>)}</ul>}
 {page.sections.map(s=><section key={s.id} aria-label={s.title}><h2>{s.title}</h2>{s.body}</section>)}
 <p className="b-caption">Last updated {new Date(`${business.policiesUpdated} 12:00:00 UTC`).toLocaleDateString(language==="en"?"en-GB":language,{day:"numeric",month:"long",year:"numeric",timeZone:"UTC"})} · {legalEntityLabel()}</p></div>
 <a href={suffix("/contact")} className="v32-new-action">{t.contact} →</a></main>;
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
