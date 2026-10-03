"use client";
import { useState } from "react";
import Link from "next/link";
import type { BrokerClient, BrokerClientDetail } from "@azuriya/api-types";
import { useResource } from "@/lib/admin-queries";
import { time } from "@/lib/format";
import { useCapability } from "@/components/admin-shell";
import { PageHeader } from "@/components/page-header";
import { DataTable, TableFilters, Badge, QueryState } from "@/components/data-table";
import { ResourceEditor } from "@/components/resource-editor";
import { AccountTable, auditColumns } from "./record-tables";
export function ClientsPage() {
 const query=useResource<BrokerClient[]>("/clients"),[search,setSearch]=useState(""),[status,setStatus]=useState("");
 const rows=(query.data||[]).filter(row=>(!status||row.status===status)&&(!search||(row.email+" "+row.name).toLowerCase().includes(search.toLowerCase())));
 return <><PageHeader title="Clients" description="Tenant memberships, status and account ownership. Client history remains available after suspension."/><section className="panel table-panel"><div className="panel-heading"><h3>Client directory</h3><small>{query.data?.length||0} memberships</small></div><TableFilters search={search} onSearch={setSearch} status={status} onStatus={setStatus} statuses={["ACTIVE","SUSPENDED"]} count={rows.length}/><DataTable rows={rows} rowKey={row=>row.id} pending={query.isPending} error={query.error} retry={()=>query.refetch()} columns={[{key:"client",label:"Client",render:row=><div className="cell-primary"><Link href={"/clients/"+row.id}>{row.name||row.email}</Link><small>{row.email}</small></div>},{key:"role",label:"Role",render:row=>row.role},{key:"status",label:"Status",render:row=><Badge value={row.status}/>},{key:"accounts",label:"Accounts",numeric:true,render:row=>row.account_count},{key:"last",label:"Last activity",render:row=>time(row.last_activity)},{key:"created",label:"Joined",render:row=>time(row.created_at)},{key:"open",label:"",render:row=><Link className="table-action" href={"/clients/"+row.id}>View client</Link>} ]}/></section></>;
}
export function ClientDetailPage({id}:{id:string}) {
 const query=useResource<BrokerClientDetail>("/clients/"+encodeURIComponent(id)),canWrite=useCapability("clients.update"),data=query.data;
 return <><PageHeader title={data?.client.name||data?.client.email||"Client details"} description="Identity, membership status, accounts and committed client activity." back="/clients"/>{query.isError||query.isPending?<section className="panel"><QueryState error={query.error} pending={query.isPending} retry={()=>query.refetch()}/></section>:data&&<><div className="detail-layout"><section className="panel"><div className="panel-heading"><div className="detail-title"><span className="detail-avatar">{data.client.email.slice(0,1).toUpperCase()}</span><div><h3>{data.client.name||"Client"}</h3><p>{data.client.email}</p></div></div><Badge value={data.client.status}/></div><dl className="key-values"><div><dt>Role</dt><dd>{data.client.role}</dd></div><div><dt>Accounts</dt><dd>{data.client.account_count}</dd></div><div><dt>Joined</dt><dd>{time(data.client.created_at)}</dd></div><div><dt>Last activity</dt><dd>{time(data.client.last_activity)}</dd></div><div><dt>Client reference</dt><dd className="id">{data.client.id}</dd></div></dl></section><ResourceEditor key={data.client.id} title="Membership status" path={"/clients/"+id} source={{status:data.client.status}} fields={[{key:"status",label:"Client status",type:"select",options:["ACTIVE","SUSPENDED"]}]} canWrite={canWrite}/></div><section className="panel table-panel"><div className="panel-heading"><h3>Owned trading accounts</h3><small>{data.accounts?.length||0} accounts</small></div><AccountTable rows={data.accounts||[]}/></section><section className="panel table-panel editor-space"><div className="panel-heading"><h3>Client activity</h3></div><DataTable rows={data.activity||[]} columns={auditColumns} rowKey={row=>row.id}/></section></>}</>;
}

