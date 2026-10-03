# Azuriya search launch

The site includes a focused article library, crawlable internal links, page metadata, social previews, structured data, `robots.txt` and an XML sitemap. The public domain has not been confirmed. Local development and preview deployments therefore stay non-indexable, and no production URL is invented.

## Configure the production domain

Set the following **server environment variables for the web app**. On Vercel, use the project's Production environment. For a local production build, Next.js reads `apps/web-trader/.env.local`; the repository's root `.env.example` documents the available variables but is not automatically loaded as the web app's environment file.

| Variable                   | Value                                                                      | Purpose                                                                |
| -------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `SITE_URL`                 | The confirmed HTTPS origin, without a path, query, fragment or custom port | Canonical URLs, structured data, social image URLs and sitemap entries |
| `SEO_ALLOW_INDEXING`       | `true` after the public site is ready                                      | Enables indexing and publishes the production sitemap                  |
| `GOOGLE_SITE_VERIFICATION` | Optional HTML verification token supplied by Search Console                | Adds the Google ownership verification meta tag                        |
| `BING_SITE_VERIFICATION`   | Optional HTML verification token supplied by Bing Webmaster Tools          | Adds the Bing ownership verification meta tag                          |

Choose one canonical host, such as the apex domain or its `www` host. Configure the deployment or DNS provider to redirect other public host variants and HTTP to that HTTPS host. The code accepts a public domain in `SITE_URL`; it rejects local hosts, IP addresses, credentials and URL paths. It does not verify DNS ownership or configure redirects.

Rebuild and redeploy after changing these variables. Metadata and search files are generated as part of the static build. Vercel Preview and Development deployments stay non-indexable even if production variables are accidentally copied into them. `next dev` also stays non-indexable. Self-hosted staging deployments should keep `SEO_ALLOW_INDEXING=false`.

## Confirm the launch output

Check the deployed site after enabling indexing:

1. Open `/robots.txt`. It should allow the public site, exclude terminal crawling and reference the same domain's `/sitemap.xml`.
2. Open `/sitemap.xml`. Every listed URL should use the confirmed canonical host and return a successful page response.
3. Inspect the homepage, a solution page and an article's HTML. Each should have its own title, description and canonical URL. Articles should include their publication metadata and structured data.
4. Open `/opengraph-image` and an article's `/share/<article-slug>` image. Check that the image renders at 1200 × 630 and that the article title is readable.
5. Check breadcrumbs, article links, source references and mobile layouts. Confirm that all content promised by search snippets is present on the page.
6. Run [Google's Rich Results Test](https://search.google.com/test/rich-results) on a published article and inspect its Article and Breadcrumb data. This validates eligibility; it does not guarantee a search feature.
7. Run [PageSpeed Insights](https://pagespeed.web.dev/) on the public homepage and article pages. Review mobile performance and field data as it becomes available.

The sitemap follows the actual page registry, so additional articles are included automatically. Article `lastmod` values come from their stored editorial dates. Product pages do not receive a fabricated last-modified date on every build. Draft legal pages, the illustrative status page, the human site directory and the trading terminal are excluded from the XML sitemap.

Legal and status pages carry `noindex, follow` and remain crawlable on production so search engines can read that directive. A robots rule controls crawling, rather than guaranteeing removal from search results. The terminal's existing authentication remains responsible for access control. See [Google's robots documentation](https://developers.google.com/search/docs/crawling-indexing/robots/intro).

## Connect search tools

Create a Google Search Console property for the confirmed domain. A Domain property uses the DNS verification method; a URL-prefix property can use an HTML verification token. Follow the token or DNS record supplied to your account, then verify ownership. The code has no access to your search account or DNS provider. See [Google's ownership verification instructions](https://support.google.com/webmasters/answer/9008080).

After verification, submit `/sitemap.xml` in Search Console's Sitemaps report and inspect the homepage and article hub with URL Inspection. Request indexing for the key pages if they are eligible. Add the same site to Bing Webmaster Tools and submit its sitemap there. A sitemap helps discovery; submission does not guarantee indexing. See [Google's sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).

Watch Search Console's indexing and performance reports after launch. Use the actual search queries, impressions, clicks and landing pages to decide which existing articles need clearer explanations or which related operator questions deserve a new guide.

## Keep the content credible

- Have the product owner review each guide against the capabilities that are actually available. Update integration claims when connectors are verified.
- Add a named author or reviewer only when a real person has written or reviewed the content. Do not invent credentials, regulatory status, customer results, ratings or endorsements.
- Keep financial examples and operational checklists clearly explained. The current article examples are planning illustrations, rather than promises of income or trade outcomes.
- Change an article's updated date only when its content materially changes. Record the publication date once.
- Publish related articles that solve specific brokerage, prop firm and community operations questions. Link them to the relevant product pages and cite official technical references where useful.
- Complete operator identity, contact and legal documents before promoting the platform publicly. These drafts are intentionally excluded from indexing.
- Share useful articles through the business's real channels and relevant industry communities. Seek genuine editorial references; avoid paid link networks, copied articles and batches of near-identical location or keyword pages.

The implementation supplies the technical foundation and content needed for discovery. Rankings depend on competition, usefulness, authority and the live site's performance; first place cannot be guaranteed. [Google's SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide) explains the practical limits and ongoing work.
