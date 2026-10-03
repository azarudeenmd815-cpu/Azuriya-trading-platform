import { notFound } from "next/navigation";
import { SitePageTemplate } from "../../../components/marketing/site-page";
import { articlePages } from "../../../components/marketing/site-articles";
import { StructuredData } from "../../../components/marketing/structured-data";
import { getSitePageMetadata } from "../../../lib/site-page-metadata";
import { getPageStructuredData } from "../../../lib/site-structured-data";

export const dynamicParams = false;
export function generateStaticParams() {
  return articlePages.map((page) => ({ slug: page.path.split("/").at(-1)! }));
}
type Props = { params: Promise<{ slug: string }> };
function getArticle(slug: string) {
  return articlePages.find((page) => page.path === `/insights/${slug}`);
}
export async function generateMetadata({ params }: Props) {
  const page = getArticle((await params).slug);
  return page ? getSitePageMetadata(page) : {};
}
export default async function ArticlePage({ params }: Props) {
  const page = getArticle((await params).slug);
  if (!page) notFound();
  return (
    <>
      <StructuredData data={getPageStructuredData(page)} />
      <SitePageTemplate page={page} />
    </>
  );
}
