import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SitePageTemplate } from "../../components/marketing/site-page";
import { getSitePage, sitePages } from "../../components/marketing/site-pages";
import { getSitePageMetadata } from "../../lib/site-page-metadata";
import { PageExperience } from "../../components/marketing/site-page-experience";
import { getPageStructuredData } from "../../lib/site-structured-data";
import { StructuredData } from "../../components/marketing/structured-data";

export const dynamicParams = false;
export function generateStaticParams() {
  return sitePages
    .filter((page) => !page.path.startsWith("/insights"))
    .map((page) => ({ slug: page.path.slice(1).split("/") }));
}
type PageProps = { params: Promise<{ slug: string[] }> };
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getSitePage(`/${slug.join("/")}`);
  if (!page) return {};
  return getSitePageMetadata(page);
}
export default async function ContentPage({ params }: PageProps) {
  const { slug } = await params;
  const page = getSitePage(`/${slug.join("/")}`);
  if (!page) notFound();
  return (
    <>
      <StructuredData data={getPageStructuredData(page)} />
      <SitePageTemplate
        page={page}
        experience={<PageExperience path={page.path} />}
      />
    </>
  );
}
