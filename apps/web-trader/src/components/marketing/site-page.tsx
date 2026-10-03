import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  Clock,
  FileText,
  ShieldCheck,
} from "@phosphor-icons/react/dist/ssr";
import { MarketingNavigation } from "./navigation";
import { SiteFooter } from "./site-footer";
import { SiteProductGraphic } from "./site-product-graphic";
import { SiteDirectory } from "./site-directory";
import { SiteInquiry } from "./site-inquiry";
import { getSiteCategory, getSitePage, sitePages } from "./site-pages";
import { ArticleInsights } from "./article-insights";
import { ArticleGraphic } from "./article-graphic";
import { formatArticleDate, getReadingMinutes } from "./site-articles";
import type { SitePage } from "./site-types";
import { MarketingSurface } from "./marketing-theme";
import "./marketing.css";
import "./brokerage.css";
import "./site-page.css";
import "./marketing-light-theme.css";
import "./marketing-reference-theme.css";
import "./landing-product-theme.css";

function OperatorDetails() {
  return (
    <section className="sp-operator" aria-labelledby="operator-information">
      <div>
        <ShieldCheck size={25} />
        <h2 id="operator-information">Operator & document information</h2>
        <p>
          These fields must be confirmed before the policies become live service
          documents.
        </p>
      </div>
      <dl>
        {[
          "Operating legal entity",
          "Registration & jurisdiction",
          "Registered address",
          "Privacy & support contacts",
        ].map((label) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>Awaiting confirmation</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function SitePageTemplate({
  page,
  experience,
}: {
  page: SitePage;
  experience?: React.ReactNode;
}) {
  const legal = page.kind === "legal";
  const directory =
    page.path === "/sitemap" ||
    page.path === "/resources" ||
    page.path === "/solutions" ||
    page.path === "/legal";
  const document = legal || page.kind === "article";
  const hub = legal
    ? { label: "Legal centre", path: "/legal" }
    : page.kind === "article"
      ? page.article
        ? { label: "Insights & articles", path: "/insights" }
        : { label: "Resources", path: "/resources" }
      : page.kind === "solution"
        ? { label: "Solutions", path: "/solutions" }
        : undefined;
  const entries = sitePages
    .filter(
      (item) =>
        item.path !== page.path &&
        (page.path === "/sitemap" ||
          (page.path === "/legal" && item.kind === "legal") ||
          (page.path === "/solutions" && item.kind === "solution") ||
          (page.path === "/resources" &&
            (item.kind === "article" ||
              item.path === "/insights" ||
              item.path === "/help" ||
              item.kind === "status"))),
    )
    .map((item) => ({
      path: item.path,
      label: item.navLabel,
      description: item.description,
      category: getSiteCategory(item),
    }));
  if (page.path === "/sitemap")
    entries.unshift(
      {
        path: "/",
        label: "Azuriya home",
        description:
          "The complete introduction to free brokerage and prop firm solutions for influencers.",
        category: "Company",
      },
      {
        path: "/mt5-deposits",
        label: "Direct MT5 deposits",
        description:
          "Explore native MetaTrader 5 funding, the provider-enabled journey and the local walkthrough.",
        category: "Platform",
      },
      {
        path: "/terminal",
        label: "Simulated trading terminal",
        description:
          "Sign in to the authenticated terminal with simulated funds and execution.",
        category: "Platform",
      },
    );
  return (
    <MarketingSurface
      className={`az-marketing sp-page ${document ? "sp-document-page" : ""}`}
    >
      <a className="az-skip-link" href="#main-content">
        Skip to content
      </a>
      <MarketingNavigation pageLinks currentPath={page.path} />
      <main id="main-content" className="az-container">
        <nav className="sp-breadcrumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span aria-hidden="true">/</span>
          {hub && hub.path !== page.path && (
            <>
              <Link href={hub.path}>{hub.label}</Link>
              <span aria-hidden="true">/</span>
            </>
          )}
          <span aria-current="page">{page.navLabel}</span>
        </nav>
        <section className={`sp-hero ${page.visual ? "sp-hero-split" : ""}`}>
          <div>
            <span className="sp-eyebrow">{page.eyebrow}</span>
            <h1>{page.title}</h1>
            <p className="sp-lead">{page.description}</p>
            {page.article && (
              <div className="ai-article-meta">
                <Link href="/insights#our-editorial-approach">
                  {page.article.author}
                </Link>
                <time dateTime={page.article.publishedAt}>
                  {formatArticleDate(page.article.publishedAt)}
                </time>
                <span>
                  <Clock size={14} />
                  {getReadingMinutes(page)} min read
                </span>
                <span>{page.article.category}</span>
                {page.article.updatedAt && (
                  <span>
                    Updated{" "}
                    <time dateTime={page.article.updatedAt}>
                      {formatArticleDate(page.article.updatedAt)}
                    </time>
                  </span>
                )}
              </div>
            )}
            {legal ? (
              <div className="sp-document-meta">
                <FileText size={18} />
                <strong>Draft framework</strong>
                <span>Operator review required · No effective date</span>
              </div>
            ) : page.article ? null : page.cta ? (
              <div className="sp-hero-actions">
                <Link className="az-button" href={page.cta.href}>
                  {page.cta.label}
                  <ArrowUpRight size={17} />
                </Link>
                <Link className="sp-text-link" href="#page-details">
                  {page.path === "/insights"
                    ? "Our editorial approach"
                    : "Explore the details"}{" "}
                  <ArrowRight size={16} />
                </Link>
              </div>
            ) : (
              <div className="sp-hero-label">
                <BookOpen size={18} />
                {page.kind === "article"
                  ? "Practical product guide"
                  : "The Azuriya workspace"}
              </div>
            )}
          </div>
          {page.visual && <SiteProductGraphic visual={page.visual} />}
        </section>
        {page.article && (
          <figure className="ai-article-cover">
            <ArticleGraphic category={page.article.category} path={page.path} />
            <figcaption>
              Operating framework illustrated for this guide.
            </figcaption>
          </figure>
        )}
        <div className="sp-highlights">
          {page.highlights.map((highlight, index) => (
            <div key={highlight.title}>
              <span>0{index + 1}</span>
              <h2>{highlight.title}</h2>
              <p>{highlight.text}</p>
            </div>
          ))}
        </div>
        {directory && (
          <SiteDirectory entries={entries} filters={page.path === "/sitemap"} />
        )}
        {page.path === "/legal" && <OperatorDetails />}
        {page.path === "/contact" && <SiteInquiry />}
        {page.path === "/insights" && <ArticleInsights />}
        {experience}
        <div className="sp-content-layout" id="page-details">
          <aside className="sp-contents">
            <span>{document ? "IN THIS DOCUMENT" : "ON THIS PAGE"}</span>
            <nav aria-label="On this page">
              {page.sections.map((section) => (
                <a key={section.id} href={`#${section.id}`}>
                  {section.title}
                </a>
              ))}
            </nav>
            {legal && (
              <div className="sp-draft-note">
                <ShieldCheck size={18} />
                <p>
                  Policy framework for the preview. Company information and
                  applicable legal requirements need operator review.
                </p>
              </div>
            )}
          </aside>
          <article
            className="sp-sections"
            aria-label={page.kind === "article" ? page.title : "Page details"}
          >
            {page.sections.map((section, index) => (
              <section
                key={section.id}
                id={section.id}
                className="sp-content-section"
              >
                <span className="sp-section-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h2>{section.title}</h2>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.bullets && (
                  <ul>
                    {section.bullets.map((bullet) => (
                      <li key={bullet}>
                        <Check size={16} />
                        {bullet}
                      </li>
                    ))}
                  </ul>
                )}
                {section.links && (
                  <div className="sp-section-links">
                    {section.links.map((link) => (
                      <Link href={link.href} key={link.href}>
                        {link.label}
                        <ArrowUpRight size={16} />
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            ))}
            {page.article && (
              <div className="ai-article-byline">
                <strong>About this guide</strong>
                <p>
                  Published by {page.article.author} for trading business
                  operators. Platform-specific references are listed below.
                  Azuriya’s local workspace contains illustrative data and
                  simulated execution. Production capabilities depend on the
                  agreed provider configuration.
                </p>
                <Link href="/insights#our-editorial-approach">
                  Our editorial approach
                </Link>
              </div>
            )}
          </article>
        </div>
        {page.steps && (
          <section className="sp-next-steps">
            <span className="sp-eyebrow">FROM SCOPE TO CONFIGURATION</span>
            <h2>A clear path for your team.</h2>
            <ol>
              {page.steps.map((step, index) => (
                <li key={step.title}>
                  <span>0{index + 1}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}
        {page.faqs && (
          <section className="sp-faq" aria-labelledby="page-faq">
            <div>
              <span className="sp-eyebrow">USEFUL ANSWERS</span>
              <h2 id="page-faq">A little more clarity.</h2>
            </div>
            <div>
              {page.faqs.map((faq) => (
                <details key={faq.question}>
                  <summary>
                    {faq.question}
                    <span aria-hidden="true">+</span>
                  </summary>
                  <p>{faq.answer}</p>
                </details>
              ))}
            </div>
          </section>
        )}
        {page.sources && (
          <section className="sp-sources">
            <h2>Reference material</h2>
            <p>
              {legal
                ? "These official sources support policy review. They do not establish Azuriya’s jurisdiction, regulatory status or compliance."
                : "Official documentation and reference material for the platform details discussed in this guide."}
            </p>
            {page.sources.map((source) => (
              <a
                href={source.href}
                key={source.href}
                target="_blank"
                rel="noreferrer"
              >
                {source.label}
                <ArrowUpRight size={16} />
              </a>
            ))}
          </section>
        )}
        <section className="sp-related">
          <div>
            <span className="sp-eyebrow">CONTINUE EXPLORING</span>
            <h2>Connected topics.</h2>
          </div>
          <div>
            {page.related.map((path) => {
              const related =
                getSitePage(path) ??
                (path === "/mt5-deposits"
                  ? {
                      eyebrow: "NATIVE MT5 FUNDING",
                      navLabel: "Direct MT5 deposits",
                    }
                  : undefined);
              return related ? (
                <Link key={path} href={path}>
                  <span>{related.eyebrow}</span>
                  <strong>
                    {related.navLabel}
                    <ArrowUpRight size={20} />
                  </strong>
                </Link>
              ) : null;
            })}
          </div>
        </section>
      </main>
      <SiteFooter />
    </MarketingSurface>
  );
}
