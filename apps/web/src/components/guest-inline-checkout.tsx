"use client";
import { quickCartSchema, type CheckoutEmailChoice, CheckoutResponse, CreateCartCheckoutRequest, QuickSession } from "@event-platform/shared-types";
import { useCallback, useEffect, useRef, useState } from "react";
import { quickRequest } from "../app/quick/api";
import { localeUrl } from "../lib/locale";
import { GUEST_CHECKOUT_COPY } from "../lib/guest-checkout-copy";
import { useLocale } from "./locale-provider";
import { CheckoutEmailOption } from "./checkout-email-option";
import { AccountIcon } from "./account-icon";

type Pending = { name: string; session: QuickSession; key: string; body?: CreateCartCheckoutRequest; email?: CheckoutEmailChoice | null };
export function GuestInlineCheckout({ body, accepted, valid, free, onFreeze, onRestore }: { body: CreateCartCheckoutRequest; accepted: boolean; valid: boolean; free: boolean; onFreeze: (locked: boolean) => void; onRestore?: ((body: CreateCartCheckoutRequest) => void) | undefined }) {
 const locale = useLocale(), copy = GUEST_CHECKOUT_COPY[locale];
 const [name,setName]=useState(""), [session,setSession]=useState<QuickSession|null>(null), [telegram,setTelegram]=useState(false), [email,setEmail]=useState<CheckoutEmailChoice|null>(null), [emailEnabled,setEmailEnabled]=useState(false), [busy,setBusy]=useState(false), [error,setError]=useState("");
 const [submitted,setSubmitted]=useState(false), [telegramRequested,setTelegramRequested]=useState(false);
 const pending=useRef<Pending|null>(null), creating=useRef<Promise<QuickSession>|null>(null), sending=useRef(false);
 const storageKey=`quick-inline:${body.eventId}`;
 const remember=useCallback((value:Pending)=>{pending.current=value;sessionStorage.setItem(storageKey,JSON.stringify(value));},[storageKey]);
 const openOrder=useCallback((id:string, value:QuickSession)=>{sessionStorage.setItem(`quick-order:${id}`,value.accessToken);window.location.assign(localeUrl(`/quick/status?order=${id}`,locale));},[locale]);
 useEffect(()=>{
  try {const saved=JSON.parse(sessionStorage.getItem(storageKey)??"null") as Pending|null;
   if(saved?.session?.sessionToken && /^[A-Za-z0-9_-]{43}$/.test(saved.session.sessionToken) && /^[A-Za-z0-9_-]{43}$/.test(saved.session.accessToken) && typeof saved.name === "string" && /^[0-9a-f-]{36}$/i.test(saved.key) && (!saved.body || (quickCartSchema.safeParse(saved.body).success && saved.body.eventId === body.eventId)) && Number.isFinite(Date.parse(saved.session.expiresAt)) && Date.parse(saved.session.expiresAt)>Date.now()){
    pending.current=saved;setName(saved.name);setSession(saved.session);setEmail(saved.email??null);setEmailEnabled(Boolean(saved.email));
    if(saved.body){onRestore?.(saved.body);setSubmitted(true);onFreeze(true);}
   }
  }catch{ /* Ignore invalid local recovery state. */ }
 },[storageKey,onFreeze,onRestore,body.eventId]);
 const ensureSession=useCallback(async()=>{
  if(pending.current?.session){if(Date.parse(pending.current.session.expiresAt)<=Date.now())throw new Error(copy.expired);return pending.current.session;}
  if(!name.trim())throw new Error(copy.nameRequired);
  if(!creating.current)creating.current=quickRequest<QuickSession>("sessions",undefined,{name:name.trim()}).then(value=>{remember({name:name.trim(),session:value,key:crypto.randomUUID()});setSession(value);return value;}).finally(()=>{creating.current=null;});
  return creating.current;
 },[name,copy,remember]);
 const getToken=useCallback(async()=> (await ensureSession()).sessionToken,[ensureSession]);
 const check=useCallback(async()=>{
  if(!session)return;
  const result=await quickRequest<{telegramVerified:boolean;verifiedEmail:string|null;orderId:string|null}>("session",session.sessionToken);
  setTelegram(result.telegramVerified);
  if(result.orderId && !sending.current) { const order = await quickRequest<{status:string}>("order",session.accessToken); if(order.status === "paid") openOrder(result.orderId,session); }
 },[session,openOrder]);
 useEffect(()=>{
  if(!session)return;let alive=true;
  const run=()=>{if(alive&&document.visibilityState!=="hidden")void check().catch(()=>undefined);};
  run();const timer=setInterval(run,3000);window.addEventListener("focus",run);
  return()=>{alive=false;clearInterval(timer);window.removeEventListener("focus",run);};
 },[session,check]);
 async function startTelegram(){setBusy(true);setError("");try{await ensureSession();setTelegramRequested(true);}catch(e){setError(e instanceof Error?e.message:copy.choose);}finally{setBusy(false);}}
 async function checkout(){
  if(sending.current||(!submitted&&(!accepted||!valid||(!telegram&&!email)||(emailEnabled&&!email))))return;
  sending.current=true;setBusy(true);setError("");
  try{
   const value=await ensureSession();
   const saved=pending.current!;
   const request=saved.body??{...body,...(email?{emailDelivery:email}:{})};
   remember({...saved,body:request,email});setSubmitted(true);onFreeze(true);
   const result=await quickRequest<CheckoutResponse>("checkouts/cart",value.sessionToken,request,saved.key);
   sessionStorage.setItem(`quick-order:${result.orderId}`,value.accessToken);
   sessionStorage.removeItem(storageKey);
   window.location.assign(result.amountDue>0&&result.paymentLink?result.paymentLink:localeUrl(`/quick/status?order=${result.orderId}`,locale));
  }catch(e){setError(e instanceof Error?e.message:copy.choose);}finally{sending.current=false;setBusy(false);}
 }
 return <div className="checkout-guest">
  <label className="checkout-guest-name">{copy.name}<input required maxLength={100} autoComplete="name" value={name} disabled={Boolean(session)||busy} placeholder={copy.nameHint} onChange={e=>setName(e.target.value)}/></label>
  <div className="checkout-guest-recipient"><h3>{copy.recipient}</h3><p>{copy.recipientHint}</p></div>
  <fieldset disabled={submitted||busy} className="checkout-guest-fields"><CheckoutEmailOption compact getQuickToken={getToken} choice={email} onChoice={value=>{setEmail(value);if(pending.current)remember({...pending.current,email:value});}} onEnabledChange={setEmailEnabled}/></fieldset>
  <div className="checkout-telegram">
   {telegram?<p className="checkout-telegram-verified"><AccountIcon name="circle-check"/>{copy.verified}</p>:<>
    {!session || !telegramRequested ? <button className="checkout-plan-button" disabled={busy||!name.trim()} type="button" onClick={()=>void startTelegram()}><AccountIcon name="send"/>{copy.telegram}</button>:<><a className="checkout-plan-button" href={session.telegramUrl} target="_blank" rel="noopener noreferrer"><AccountIcon name="send"/>{copy.openTelegram}<AccountIcon name="arrow-up-right"/></a><p>{copy.waiting}</p><button className="checkout-text-action" type="button" onClick={()=>void check().catch(e=>setError(e instanceof Error?e.message:copy.choose))}>{copy.check}</button></>}
   </>}
  </div>
  {error?<p role="alert" className="checkout-message is-error">{error}</p>:null}
  {submitted?<p className="checkout-note" role="status">{copy.locked}</p>:null}
  <button className="checkout-primary" disabled={busy||(!submitted&&(!name.trim()||!accepted||!valid||(!telegram&&!email)||(emailEnabled&&!email)))} type="button" aria-busy={busy} onClick={()=>void checkout()}><span>{busy?copy.busy:submitted?copy.recover:free?copy.register:copy.continue}</span><AccountIcon name="arrow-right"/></button>
  {!telegram&&!email?<p className="checkout-continue-hint">{copy.choose}</p>:null}
 </div>;
}
