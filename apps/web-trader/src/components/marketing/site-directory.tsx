"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, MagnifyingGlass, X } from "@phosphor-icons/react";
import type { SiteCategory } from "./site-pages";

export type DirectoryEntry = {
  path: string;
  label: string;
  description: string;
  category: SiteCategory;
};
export function SiteDirectory({
  entries,
  filters = false,
}: {
  entries: DirectoryEntry[];
  filters?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All pages");
  const categories = [
    "All pages",
    "Platform",
    "Solutions",
    "Resources",
    "Company",
    "Legal",
  ];
  const visible = entries.filter(
    (entry) =>
      (category === "All pages" || entry.category === category) &&
      `${entry.label} ${entry.description}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  return (
    <section className="sp-directory" aria-label="Page directory">
      <div className="sp-directory-toolbar">
        <label className="sp-search">
          <MagnifyingGlass size={19} />
          <input
            aria-label="Search pages"
            type="search"
            placeholder="Search pages and topics"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button aria-label="Clear page search" onClick={() => setQuery("")}>
              <X size={16} />
            </button>
          )}
        </label>
        <span role="status">
          {visible.length} {visible.length === 1 ? "page" : "pages"}
        </span>
      </div>
      {filters && (
        <div
          className="sp-directory-filters"
          aria-label="Filter pages by category"
        >
          {categories.map((value) => (
            <button
              key={value}
              aria-pressed={category === value}
              onClick={() => setCategory(value)}
            >
              {value}
            </button>
          ))}
        </div>
      )}
      <div className="sp-directory-grid">
        {visible.map((entry) => (
          <Link
            className="sp-directory-entry"
            href={entry.path}
            key={entry.path}
          >
            <span className="sp-entry-category">{entry.category}</span>
            <h3>
              {entry.label}
              <ArrowUpRight size={19} />
            </h3>
            <p>{entry.description}</p>
            <span className="sp-entry-path">{entry.path}</span>
          </Link>
        ))}
      </div>
      {!visible.length && (
        <div className="sp-directory-empty">
          <h3>No pages match this search.</h3>
          <p>
            Try a different topic or clear the search to explore the directory.
          </p>
          <button
            onClick={() => {
              setQuery("");
              setCategory("All pages");
            }}
          >
            Show all pages <ArrowUpRight size={16} />
          </button>
        </div>
      )}
    </section>
  );
}
