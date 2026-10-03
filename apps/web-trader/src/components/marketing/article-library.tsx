"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, MagnifyingGlass, Clock } from "@phosphor-icons/react";
import { ArticleGraphic } from "./article-graphic";
import type { SiteArticle } from "./site-types";

export type ArticleCard = {
  path: string;
  title: string;
  description: string;
  category: SiteArticle["category"];
  readingMinutes: number;
};
const categories = [
  "All articles",
  "Brokerage",
  "Prop firms",
  "Copy trading",
  "Infrastructure",
  "Community",
] as const;

export function ArticleLibrary({ articles }: { articles: ArticleCard[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("All articles");
  const visible = articles.filter(
    (article) =>
      (category === "All articles" || category === article.category) &&
      `${article.title} ${article.description} ${article.category}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  return (
    <section
      id="article-library"
      className="ai-library"
      aria-labelledby="article-library-title"
    >
      <div className="ai-library-heading">
        <div>
          <span className="sp-eyebrow">THE READING ROOM</span>
          <h2 id="article-library-title">Explore the articles.</h2>
        </div>
        <label className="ai-search">
          <MagnifyingGlass size={18} />
          <span className="az-sr-only">Search articles</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search a topic…"
            aria-label="Search articles"
          />
        </label>
      </div>
      <div className="ai-filters" role="group" aria-label="Article topics">
        {categories.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={category === item}
            onClick={() => setCategory(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <p className="ai-result-count" role="status" aria-live="polite">
        {visible.length} {visible.length === 1 ? "article" : "articles"}
        {category !== "All articles"
          ? ` in ${category.toLowerCase()}`
          : " to explore"}
      </p>
      <div className="ai-card-grid">
        {visible.map((article) => (
          <article className="ai-card" key={article.path}>
            <Link
              href={article.path}
              className="ai-cover-link"
              aria-label={`Read: ${article.title}`}
              tabIndex={-1}
            >
              <ArticleGraphic category={article.category} path={article.path} />
            </Link>
            <div className="ai-card-copy">
              <span className="ai-category">{article.category}</span>
              <h3>
                <Link href={article.path}>
                  {article.title}
                  <ArrowUpRight size={18} />
                </Link>
              </h3>
              <p>{article.description}</p>
              <span className="ai-reading-time">
                <Clock size={14} />
                {article.readingMinutes} min read
              </span>
            </div>
          </article>
        ))}
      </div>
      {visible.length === 0 && (
        <div className="ai-empty">
          <h3>No articles match this search.</h3>
          <p>Try another topic or explore the full collection.</p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setCategory("All articles");
            }}
          >
            Show all articles
          </button>
        </div>
      )}
    </section>
  );
}
