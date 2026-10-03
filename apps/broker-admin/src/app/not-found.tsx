import Link from "next/link";
export default function NotFound() { return <section className="empty"><h1>Workspace not found</h1><p>Choose a broker workspace from the navigation.</p><Link className="primary" href="/dashboard">Open overview</Link></section>; }

