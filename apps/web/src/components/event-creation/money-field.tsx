"use client";
import { useEffect,useState,useRef } from "react";
import { useCreationValidation } from "./creation-validation";
import { parseMinorAmount,type CurrencyCapability } from "@event-platform/shared-types";
export function minorDecimal(amount:number,exponent:number){const scale=10**exponent;return `${Math.floor(amount/scale)}${exponent?`.${String(amount%scale).padStart(exponent,"0")}`:""}`;}
export function MoneyField({label,value,currency,onChange,disabled=false,validationKey}:{label:string;value:number|null;currency:CurrencyCapability;disabled?:boolean;validationKey?:string;onChange:(amount:number|null)=>void}){
  const validation=useCreationValidation(validationKey), focused=useRef(false);
  const [text,setText]=useState(value===null?"":minorDecimal(value,currency.exponent)),[error,setError]=useState("");
  useEffect(()=>{if(focused.current)return;setText(value===null?"":minorDecimal(value,currency.exponent));},[value,currency.code,currency.exponent]);
  return <label {...validation.wrapper} className="creation-field block text-sm">{label} · {currency.code}<input disabled={disabled} className="creation-input mt-1 w-full rounded-xl border border-slate-300 dark:border-ticket-border bg-white dark:bg-ticket-surface px-3 py-2 outline-violet-500 dark:outline-ticket-accent" inputMode="decimal" onFocus={()=>{focused.current=true;}} value={text} aria-label={label} aria-required aria-describedby={validation.control["aria-describedby"]} aria-invalid={!!error||validation.invalid} onChange={event=>{const next=event.target.value;setText(next);if(!next){onChange(null);setError("");return;}try{const amount=parseMinorAmount(next,currency);onChange(amount);setError("");}catch{setError("Invalid amount");}}} onBlur={()=>{focused.current=false;if(!error&&value!==null)setText(minorDecimal(value,currency.exponent));}}/>{error?<span role="alert" className="text-xs text-red-700 dark:text-ticket-danger">{error}</span>:null}{validation.error}</label>;
}
