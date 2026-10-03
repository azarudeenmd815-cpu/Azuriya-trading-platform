import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Clock,
} from "@phosphor-icons/react/dist/ssr";
import { ArticleLibrary } from "./article-library";
import { ArticleGraphic } from "./article-graphic";
import {
  articlePages,
  articleReadingPaths,
  getReadingMinutes,
} from "./site-articles";
import "./article-insights.css";

export function ArticleInsights() {
  const featured = articlePages[0];
  if (!featured?.article) return null;
  return (
    <>
      <Link href={featured.path} className="ai-featured">
        <div className="ai-featured-copy">
          <span className="sp-eyebrow">
            START HERE / {featured.article.category}
          </span>
          <h2>{featured.title}</h2>
          <p>{featured.description}</p>
          <span className="ai-featured-action">
            Read the launch checklist <ArrowUpRight size={17} />
            <small>
              <Clock size={14} />
              {getReadingMinutes(featured)} min read
            </small>
          </span>
        </div>
        <ArticleGraphic
          category={featured.article.category}
          path={featured.path}
        />
      </Link>
      <section
        className="ai-reading-paths"
        aria-labelledby="reading-paths-title"
      >
        <div className="ai-library-heading">
          <div>
            <span className="sp-eyebrow">CHOOSE YOUR NEXT STEP</span>
            <h2 id="reading-paths-title">A reading path for your role.</h2>
          </div>
          <a href="#article-library" className="sp-text-link">
            Browse the full collection <ArrowRight size={16} />
          </a>
        </div>
        <div className="ai-reading-path-grid">
          {articleReadingPaths.map((readingPath, index) => (
            <section
              className="ai-reading-path"
              key={readingPath.title}
              aria-labelledby={`reading-path-${index}`}
            >
              <div className="ai-path-heading">
                <span>0{index + 1}</span>
                <h3 id={`reading-path-${index}`}>{readingPath.title}</h3>
              </div>
              <p>{readingPath.description}</p>
              <ol>
                {readingPath.paths.map((path, step) => {
                  const article = articlePages.find(
                    (page) => page.path === path,
                  );
                  return article ? (
                    <li key={path}>
                      <span aria-hidden="true">0{step + 1}</span>
                      <Link href={path}>
                        {article.navLabel}
                        <ArrowUpRight size={15} />
                      </Link>
                    </li>
                  ) : null;
                })}
              </ol>
            </section>
          ))}
        </div>
      </section>
      <ArticleLibrary
        articles={articlePages
          .filter((page) => page.article)
          .map((page) => ({
            path: page.path,
            title: page.title,
            description: page.description,
            category: page.article!.category,
            readingMinutes: getReadingMinutes(page),
          }))}
      />
    </>
  );
}

export function FeaturedArticles() {
  const selected = [
    articlePages[0],
    articlePages.find((page) => page.path.includes("prop-firm-challenge")),
    articlePages.find((page) => page.path.includes("mt5-deposit")),
  ].filter((page) => page?.article);
  return (
    <section
      className="az-section az-container ai-home"
      aria-labelledby="home-insights-title"
    >
      <div className="ai-home-heading">
        <div>
          <div className="az-eyebrow">
            <BookOpen size={17} /> THE AZURIYA JOURNAL
          </div>
          <h2 id="home-insights-title">Build with a clearer view.</h2>
          <p>Practical reading for your next operational decision.</p>
        </div>
        <Link href="/insights" className="az-text-link">
          Explore all articles <ArrowRight size={17} />
        </Link>
      </div>
      <div className="ai-card-grid">
        {selected.map(
          (page) =>
            page &&
            page.article && (
              <article className="ai-card" key={page.path}>
                <ArticleGraphic
                  category={page.article.category}
                  path={page.path}
                />
                <div className="ai-card-copy">
                  <span className="ai-category">{page.article.category}</span>
                  <h3>
                    <Link href={page.path}>
                      {page.title}
                      <ArrowUpRight size={18} />
                    </Link>
                  </h3>
                  <p>{page.description}</p>
                  <span className="ai-reading-time">
                    <Clock size={14} />
                    {getReadingMinutes(page)} min read
                  </span>
                </div>
              </article>
            ),
        )}
      </div>
    </section>
  );
}
