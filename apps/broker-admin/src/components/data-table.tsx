"use client";
import { MagnifyingGlass, Table } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { errorMessage } from "@/lib/api";
export interface Column<T> { key:string; label:string; numeric?:boolean; render:(row:T)=>ReactNode; }
export function Badge({value}:{value:string|undefined}) { const positive=["ACTIVE","OPEN","NORMAL","FILLED","ACCEPTED","COMPLETED"],negative=["REJECTED","SUSPENDED","DISABLED","STOP_OUT","CLOSED"],warning=["MARGIN_CALL","CLOSE_ONLY","READ_ONLY"];return <span className={"badge "+(positive.includes(value||"")?"positive":negative.includes(value||"")?"negative":warning.includes(value||"")?"warning":"")}>{(value||"—").replaceAll("_"," ")}</span>; }
export function QueryState({pending,error,retry}:{pending?:boolean;error?:unknown;retry?:()=>void}) { return error?<div className="empty"><p className="error" role="alert">{errorMessage(error)}{retry&&<button onClick={retry}>Retry</button>}</p></div>:pending?<div className="empty"><span className="spinner"/><p>Loading canonical records…</p></div>:null; }
export function DataTable<T>({rows,columns,rowKey,empty="No records match this workspace.",pending,error,retry}:{rows:T[];columns:Column<T>[];rowKey:(row:T)=>string;empty?:string;pending?:boolean;error?:unknown;retry?:()=>void}) {
 if(error||pending)return <QueryState pending={pending} error={error} retry={retry}/>;
 if(!rows.length)return <div className="empty"><span className="empty-icon"><Table size={23}/></span><h3>No records yet</h3><p>{empty}</p></div>;
 return <div className="table-scroll" tabIndex={0} role="region" aria-label="Scrollable records"><table><thead><tr>{columns.map(column=><th key={column.key} className={column.numeric?"num":undefined}>{column.label}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={rowKey(row)}>{columns.map(column=><td key={column.key} className={column.numeric?"num":undefined}>{column.render(row)}</td>)}</tr>)}</tbody></table></div>;
}
export function TableFilters({search,onSearch,status,onStatus,statuses,count}:{search:string;onSearch:(value:string)=>void;status?:string;onStatus?:(value:string)=>void;statuses?:string[];count?:number}) {return <div className="table-toolbar"><label className="search-box"><MagnifyingGlass size={17}/><input aria-label="Search records" placeholder="Search records…" value={search} onChange={e=>onSearch(e.target.value)}/></label>{onStatus&&<select aria-label="Filter status" value={status||""} onChange={e=>onStatus(e.target.value)}><option value="">All statuses</option>{statuses?.map(value=><option key={value}>{value}</option>)}</select>}<span className="result-count">{count??0} records</span></div>; }

