"use client";
import Link from "next/link";
import type { Position, Order, Fill, AccountTransaction, AuditEvent, BrokerAccount } from "@azuriya/api-types";
import { DataTable, Badge, type Column } from "@/components/data-table";
import { money, decimal, sign, time, label } from "@/lib/format";
export const accountColumns:Column<BrokerAccount>[]=[
 {key:"account",label:"Account",render:row=><div className="cell-primary"><Link href={"/accounts/"+row.id}>{row.account_number}</Link><small>{row.name}</small></div>},
 {key:"mode",label:"Mode",render:row=>label(row.mode)},{key:"status",label:"Status",render:row=><Badge value={row.status}/>},
 {key:"balance",label:"Balance",numeric:true,render:row=>money(row.balance,row.currency)},{key:"equity",label:"Equity",numeric:true,render:row=>money(row.equity,row.currency)},
 {key:"pnl",label:"Floating P&L",numeric:true,render:row=><span className={sign(row.unrealized_pnl)}>{money(row.unrealized_pnl,row.currency)}</span>},
 {key:"margin",label:"Margin level",numeric:true,render:row=>row.margin_used==="0"?"—":decimal(row.margin_level)+"%"},{key:"leverage",label:"Maximum leverage",numeric:true,render:row=>"1:"+row.leverage}
];
export const positionColumns:Column<Position>[]=[
 {key:"symbol",label:"Position",render:row=><div className="cell-primary">{row.symbol}<small className="id">{row.id.slice(0,12)}</small></div>},
 {key:"account",label:"Account",render:row=><Link href={"/accounts/"+row.account_id}>{row.account_id.slice(0,12)}</Link>},
 {key:"side",label:"Side",render:row=><Badge value={row.side}/>},{key:"status",label:"State",render:row=><Badge value={row.status}/>},
 {key:"quantity",label:"Lots",numeric:true,render:row=>row.quantity},{key:"entry",label:"Entry",numeric:true,render:row=>row.open_price},{key:"current",label:"Current",numeric:true,render:row=>row.current_price},
 {key:"protection",label:"SL / TP",render:row=>(row.stop_loss||"—")+" / "+(row.take_profit||"—")},
 {key:"pnl",label:"Floating P&L",numeric:true,render:row=><span className={sign(row.unrealized_pnl)}>{money(row.unrealized_pnl)}</span>},
 {key:"commission",label:"Commission paid",numeric:true,render:row=>money((row as Position&{commission_paid?:string}).commission_paid)},
 {key:"swap",label:"Swap accrued",numeric:true,render:row=>money((row as Position&{swap_accrued?:string}).swap_accrued)},{key:"time",label:"Opened",render:row=>time(row.opened_at)}
];
export const orderColumns:Column<Order>[]=[
 {key:"symbol",label:"Order",render:row=><div className="cell-primary">{row.symbol}<small className="id">{row.id.slice(0,12)}</small></div>},{key:"account",label:"Account",render:row=><Link href={"/accounts/"+row.account_id}>{row.account_id.slice(0,12)}</Link>},
 {key:"type",label:"Type",render:row=>row.side+" "+row.type},{key:"state",label:"State",render:row=><Badge value={row.status}/>},{key:"quantity",label:"Lots",numeric:true,render:row=>row.quantity},{key:"remaining",label:"Remaining",numeric:true,render:row=>row.remaining_quantity},{key:"price",label:"Requested / trigger",numeric:true,render:row=>row.limit_price||row.stop_price||row.requested_price||"Market"},{key:"reject",label:"Rejection",render:row=><span title={row.reject_reason}>{row.reject_code||"—"}</span>},{key:"time",label:"Placed",render:row=>time(row.created_at)}
];
export const fillColumns:Column<Fill>[]=[
 {key:"symbol",label:"Execution",render:row=><div className="cell-primary">{row.symbol}<small className="id">{row.id.slice(0,12)}</small></div>},{key:"account",label:"Account",render:row=><Link href={"/accounts/"+row.account_id}>{row.account_id.slice(0,12)}</Link>},{key:"side",label:"Side",render:row=><Badge value={row.side}/>},{key:"lots",label:"Lots",numeric:true,render:row=>row.quantity},{key:"price",label:"Fill price",numeric:true,render:row=>row.price},{key:"reference",label:"Reference bid / ask",render:row=>row.reference_bid+" / "+row.reference_ask},{key:"commission",label:"Commission",numeric:true,render:row=>money((row as Fill&{commission?:string}).commission)},{key:"reason",label:"Reason",render:row=>label(row.execution_reason)},{key:"latency",label:"Latency",numeric:true,render:row=>row.execution_latency_ms+" ms"},{key:"time",label:"Executed",render:row=>time(row.created_at)}
];
export const transactionColumns:Column<AccountTransaction>[]=[
 {key:"id",label:"Transaction",render:row=><span className="id">{row.id.slice(0,16)}</span>},{key:"account",label:"Account",render:row=><Link href={"/accounts/"+row.account_id}>{row.account_id.slice(0,12)}</Link>},{key:"type",label:"Type",render:row=>label(row.type)},{key:"amount",label:"Amount",numeric:true,render:row=><span className={sign(row.amount)}>{money(row.amount)}</span>},{key:"reference",label:"Reference",render:row=>(row as AccountTransaction&{reference?:string}).reference||"—"},{key:"reason",label:"Reason",render:row=>(row as AccountTransaction&{reason?:string}).reason||"—"},{key:"time",label:"Recorded",render:row=>time(row.created_at)}
];
export const auditColumns:Column<AuditEvent>[]=[
 {key:"sequence",label:"Sequence",numeric:true,render:row=>row.sequence},{key:"event",label:"Event",render:row=>label(row.event_type)},{key:"entity",label:"Entity",render:row=>row.aggregate_type},{key:"target",label:"Target",render:row=><span className="id">{row.aggregate_id?.slice(0,16)}</span>},{key:"time",label:"Recorded",render:row=>time(row.occurred_at)}
];
export function AccountTable({rows}:{rows:BrokerAccount[]}) { return <DataTable rows={rows} columns={accountColumns} rowKey={row=>row.id}/>; }

