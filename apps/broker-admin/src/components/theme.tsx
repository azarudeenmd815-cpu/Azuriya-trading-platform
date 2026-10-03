"use client";
import { useSyncExternalStore } from "react";
import { Moon, Sun } from "@phosphor-icons/react";
const event="azuriya:broker-theme"; const key="azuriya.marketing-theme";
export const themeBootstrap = '(()=>{let theme="dark";try{const saved=localStorage.getItem("azuriya.marketing-theme");if(saved==="light"||saved==="dark")theme=saved}catch{}document.documentElement.dataset.productTheme=theme})();';
function snapshot() { return document.documentElement.dataset.productTheme==="light"?"light":"dark"; }
function subscribe(callback:()=>void) { const storage=(event:StorageEvent)=>{if(event.key===key||event.key===null){document.documentElement.dataset.productTheme=event.newValue==="light"?"light":"dark";callback();}}; window.addEventListener(event,callback);window.addEventListener("storage",storage);return()=>{window.removeEventListener(event,callback);window.removeEventListener("storage",storage);}; }
export function ThemeSwitch() { const theme=useSyncExternalStore(subscribe,snapshot,()=>"dark"); const next=theme==="dark"?"light":"dark";return <button type="button" className="round-tool" aria-label={"Switch to "+next+" theme"} title={"Switch to "+next+" theme"} onClick={()=>{document.documentElement.dataset.productTheme=next;try{localStorage.setItem(key,next);}catch{}window.dispatchEvent(new Event(event));}}>{theme==="dark"?<Sun size={19}/>:<Moon size={19}/>}</button>; }

