"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  MagnifyingGlass,
  PlugsConnected,
  X,
} from "@phosphor-icons/react";
import {
  ecosystemCategories,
  ecosystemCategoryCounts,
  ecosystemCount,
  filterEcosystem,
  type EcosystemCategoryId,
} from "@/lib/ecosystem-catalog";
import { EcosystemLogo } from "./ecosystem-logo";
import "./ecosystem-directory.css";

export function EcosystemDirectory() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<EcosystemCategoryId | "all">("all");
  const [limit, setLimit] = useState(48);
  useEffect(() => {
    const selected = new URLSearchParams(window.location.search).get(
      "category",
    );
    if (ecosystemCategories.some((group) => group.id === selected))
      setCategory(selected as EcosystemCategoryId);
  }, []);
  const results = useMemo(
    () => filterEcosystem(query, category),
    [query, category],
  );
  const grouped = ecosystemCategories
    .filter((group) => category === "all" || group.id === category)
    .map((group) => ({
      ...group,
      items: results.filter((item) => item.category === group.id),
    }))
    .filter((group) => group.items.length > 0);
  const compact = category === "all" && !query.trim();
  const chooseCategory = (value: EcosystemCategoryId | "all") => {
    setCategory(value);
    setLimit(48);
  };

  return (
    <section
      className="az-container ec-directory"
      aria-labelledby="ec-directory-title"
    >
      <div className="ec-hero">
        <div className="ec-hero-copy">
          <div className="az-eyebrow">
            <PlugsConnected size={17} /> THE AZURIYA ECOSYSTEM
          </div>
          <h1 id="ec-directory-title">
            Your platforms.
            <br />
            <span>Your connected world.</span>
          </h1>
          <p>
            Explore the trading technology and business tools around your
            operation. Find your stack, then agree the connections you need.
          </p>
        </div>
        <div className="ec-hero-count">
          <strong>{ecosystemCount}</strong>
          <span>platforms & tools</span>
          <small>{ecosystemCategories.length} categories · one directory</small>
        </div>
      </div>
      <div className="ec-toolbar">
        <label className="ec-search">
          <MagnifyingGlass size={21} />
          <input
            type="search"
            aria-label="Search platforms and tools"
            placeholder="Search a platform, tool or category"
            value={query}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setLimit(48);
            }}
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
            >
              <X size={16} />
            </button>
          )}
        </label>
        <Link className="az-button" href="/contact">
          Plan an integration
          <ArrowUpRight size={17} />
        </Link>
      </div>
      <p className="ec-scope">
        This is an ecosystem catalog. Connections are reviewed on request and
        depend on API access, provider permissions and your agreed scope.
      </p>
      <div className="ec-directory-layout">
        <nav className="ec-filters" aria-label="Platform categories">
          <button
            type="button"
            aria-pressed={category === "all"}
            onClick={() => chooseCategory("all")}
          >
            <span>All platforms & tools</span>
            <span>{ecosystemCount}</span>
          </button>
          {ecosystemCategories.map((group) => (
            <button
              key={group.id}
              type="button"
              aria-pressed={category === group.id}
              onClick={() => chooseCategory(group.id)}
            >
              <span>{group.name}</span>
              <span>{ecosystemCategoryCounts[group.id]}</span>
            </button>
          ))}
        </nav>
        <div className="ec-results">
          <div className="ec-result-count" role="status" aria-live="polite">
            {results.length} {results.length === 1 ? "result" : "results"}
            {query.trim() ? ` for “${query.trim()}”` : " in the catalog"}
          </div>
          {grouped.map((group) => {
            const visible = compact
              ? group.items.slice(0, 6)
              : group.items.slice(0, limit);
            return (
              <section
                className="ec-category"
                key={group.id}
                aria-labelledby={`ec-title-${group.id}`}
              >
                <div className="ec-category-heading">
                  <div>
                    <h2 id={`ec-title-${group.id}`}>{group.name}</h2>
                    <p>{group.description}</p>
                  </div>
                  <span>{group.items.length}</span>
                </div>
                <div className="ec-card-grid">
                  {visible.map((item) => (
                    <a
                      className="ec-card"
                      key={item.id}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Explore ${item.name} (opens in a new tab)`}
                    >
                      <EcosystemLogo item={item} />
                      <div>
                        <h3>{item.name}</h3>
                        <span>{item.status}</span>
                      </div>
                      <ArrowUpRight size={16} aria-hidden="true" />
                    </a>
                  ))}
                </div>
                {group.items.length > visible.length && (
                  <button
                    className="ec-show-more"
                    type="button"
                    onClick={() => {
                      if (compact) chooseCategory(group.id);
                      else setLimit((value) => value + 48);
                    }}
                  >
                    View{" "}
                    {compact
                      ? `all ${group.items.length} ${group.name.toLowerCase()}`
                      : "more results"}
                    <ArrowUpRight size={15} />
                  </button>
                )}
              </section>
            );
          })}
          {results.length === 0 && (
            <div className="ec-empty">
              <MagnifyingGlass size={28} />
              <h2>No matches yet.</h2>
              <p>Try a different platform name or explore another category.</p>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  chooseCategory("all");
                }}
              >
                Reset search
              </button>
              <Link href="/contact">
                Request a platform <ArrowUpRight size={15} />
              </Link>
            </div>
          )}
        </div>
      </div>
      <div className="ec-directory-footer">
        <div>
          <h2>Your stack belongs here.</h2>
          <p>
            Share your platforms and workflows. We’ll review the connection
            scope with you.
          </p>
        </div>
        <Link className="az-button" href="/contact">
          Discuss Your Stack
          <ArrowUpRight size={17} />
        </Link>
      </div>
      <p className="ec-source-note">
        Catalog references include the{" "}
        <a
          href="https://n8n.io/integrations/"
          target="_blank"
          rel="noopener noreferrer"
        >
          n8n app ecosystem
        </a>
        ,{" "}
        <a
          href="https://tradelocker.com/partners/"
          target="_blank"
          rel="noopener noreferrer"
        >
          TradeLocker’s public partner directory
        </a>
        , and platform websites. Logos belong to their respective owners. A
        listing does not establish an Azuriya partnership or an active
        integration.
      </p>
    </section>
  );
}
