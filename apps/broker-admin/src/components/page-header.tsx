import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
export function PageHeader({title,description,eyebrow="OPERATIONS WORKSPACE",children,back}:{title:string;description:string;eyebrow?:string;children?:React.ReactNode;back?:string}) { return <header className="page-header"><div>{back&&<Link className="muted" href={back}><ArrowLeft size={13}/> Back to list</Link>}<span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{children&&<div className="page-actions">{children}</div>}</header>; }

