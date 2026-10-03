import type { BrokerProfile, ProfileKind } from "@azuriya/api-types";
export interface Field { key: string; label: string; type?: "text" | "decimal" | "integer" | "select" | "boolean" | "time" | "email"; options?: readonly string[]; help?: string; signed?: boolean; required?: boolean; min?: number; max?: number; }
export const profileResources: Record<ProfileKind,string> = { PRICING:"pricing-profiles",COMMISSION:"commission-plans",SWAP:"swap-plans",LEVERAGE:"leverage-plans",MARGIN:"margin-profiles",EXECUTION:"execution-profiles",SESSION:"trading-sessions" };
export const policyFields: Record<ProfileKind,readonly Field[]> = {
 PRICING:[{key:"unit",label:"Markup unit",type:"select",options:["PRICE","POINTS"]},{key:"bid_markup",label:"Bid subtraction",type:"decimal"},{key:"ask_markup",label:"Ask addition",type:"decimal"},{key:"minimum_spread",label:"Minimum spread",type:"decimal"},{key:"maximum_spread",label:"Maximum spread",type:"decimal",help:"Zero leaves the maximum uncapped."}],
 COMMISSION:[{key:"mode",label:"Charging basis",type:"select",options:["NONE","PER_LOT_PER_SIDE","PER_LOT_ROUND_TURN"]},{key:"amount",label:"Amount per lot",type:"decimal",help:"Per side charges opening and closing. Round turn charges the full amount at opening."},{key:"currency",label:"Currency",type:"select",options:["USD"]}],
 SWAP:[{key:"enabled",label:"Enable financing accrual",type:"boolean"},{key:"long_rate",label:"Long rate per lot",type:"decimal",signed:true},{key:"short_rate",label:"Short rate per lot",type:"decimal",signed:true},{key:"currency",label:"Currency",type:"select",options:["USD"]},{key:"timezone",label:"Rollover timezone",help:"Use a named timezone, such as UTC or America/New_York."},{key:"rollover_time",label:"Local rollover time",type:"time"},{key:"triple_swap_day",label:"Triple swap weekday",type:"integer",min:0,max:6,help:"Sunday = 0 · Monday = 1 · Wednesday = 3."},{key:"catch_up_days",label:"Catch-up limit in days",type:"integer",min:1,max:31}],
 LEVERAGE:[{key:"max_leverage",label:"Maximum leverage",type:"decimal",help:"The account maximum and optional account cap also apply."}],
 MARGIN:[{key:"margin_call_level",label:"Margin call level (%)",type:"decimal"},{key:"stop_out_level",label:"Stop-out level (%)",type:"decimal"},{key:"stop_out_enabled",label:"Enable automatic stop-out",type:"boolean",help:"Threshold equality is a breach. The server closes the largest floating loss first."}],
 EXECUTION:[{key:"latency_mode",label:"Latency policy",type:"select",options:["NONE","FIXED"]},{key:"base_latency_ms",label:"Fixed simulated latency (ms)",type:"integer",min:0,max:5000},{key:"slippage_mode",label:"Slippage policy",type:"select",options:["NONE"]}],
 SESSION:[{key:"timezone",label:"Session timezone",help:"Use a named timezone; the server validates daylight saving behavior."},{key:"default_status",label:"Outside configured windows",type:"select",options:["OPEN","CLOSE_ONLY","CLOSED"]}]
};
const defaults = {
 PRICING:{unit:"POINTS",bid_markup:"0",ask_markup:"0",minimum_spread:"0",maximum_spread:"0"},
 COMMISSION:{mode:"NONE",amount:"0",currency:"USD"},
 SWAP:{enabled:false,long_rate:"0",short_rate:"0",currency:"USD",timezone:"UTC",rollover_time:"22:00",triple_swap_day:3,catch_up_days:7},
 LEVERAGE:{max_leverage:"100",rules:[]},
 MARGIN:{margin_call_level:"100",stop_out_level:"50",stop_out_enabled:true},
 EXECUTION:{latency_mode:"NONE",base_latency_ms:0,slippage_mode:"NONE"},
 SESSION:{timezone:"UTC",default_status:"OPEN",windows:[]}
};
export function createProfile(kind: ProfileKind): BrokerProfile { return {id:"",tenant_id:"",kind,name:"",description:"",status:"ACTIVE",revision:0,created_at:"",updated_at:"",[kind.toLowerCase()]:structuredClone(defaults[kind]),symbol_overrides:[]}; }
export function validateFields(fields: readonly Field[], input: object): Record<string,string> {
 const data=input as Record<string,unknown>, errors:Record<string,string>={};
 for(const field of fields) { const value=data[field.key];
 if(field.type==="boolean") continue;
 if(value==null || value==="") { if(field.required!==false) errors[field.key]="This field is required."; continue; }
 if(field.type==="decimal" && (typeof value!=="string" || !(field.signed?/^-?\d+(?:\.\d+)?$/:/^\d+(?:\.\d+)?$/).test(value))) errors[field.key]="Enter a decimal string without exponent notation.";
 if(field.type==="integer" && (typeof value!=="number" || !Number.isSafeInteger(value) || value<(field.min??0) || value>(field.max??Number.MAX_SAFE_INTEGER))) errors[field.key]="Enter a whole number from "+(field.min??0)+" to "+(field.max??"the supported maximum")+".";
 if(field.type==="select" && !field.options?.includes(String(value))) errors[field.key]="Select a supported value.";
 if(field.type==="time" && (typeof value!=="string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))) errors[field.key]="Enter a time from 00:00 through 23:59.";
 }
 return errors;
}
export function validatePolicy(kind: ProfileKind,input:object) { const errors=validateFields(policyFields[kind],input), data=input as Record<string,unknown>; if(kind==="COMMISSION" && data.mode==="NONE" && typeof data.amount==="string" && /[1-9]/.test(data.amount)) errors.amount="NONE requires a zero commission amount."; if(kind==="EXECUTION" && data.latency_mode==="NONE" && data.base_latency_ms!==0) errors.base_latency_ms="NONE requires zero latency."; return errors; }
export function profileCommand(profile: BrokerProfile,reason: string,creating:boolean): Omit<BrokerProfile,"id"|"tenant_id"|"created_at"|"updated_at"|"kind"> & {reason:string} {
 const payload=profile.kind.toLowerCase() as "pricing"|"commission"|"swap"|"leverage"|"margin"|"execution"|"session";
 return {name:profile.name,description:profile.description,status:profile.status,revision:creating?1:profile.revision,[payload]:profile[payload],...(["PRICING","COMMISSION","SWAP"].includes(profile.kind)?{symbol_overrides:profile.symbol_overrides||[]}:{}),reason};
}
