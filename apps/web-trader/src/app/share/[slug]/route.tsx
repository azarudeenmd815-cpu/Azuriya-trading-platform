import { articlePages } from "../../../components/marketing/site-articles";
import { renderShareImage } from "../../../lib/share-image";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const article = articlePages.find(
    (page) => page.path.split("/").at(-1) === slug,
  );
  if (!article?.article)
    return new Response("Article not found", { status: 404 });
  return renderShareImage({
    title: article.title,
    category: article.article.category,
    subtitle: article.description,
  });
}
