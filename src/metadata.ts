import type { Article, ArticleBody } from "./types.js";
import type { Metadata } from "next";

/**
 * The `<head>` for one article, built from the article.
 *
 * ## Why this is not a component
 *
 * Metadata in the App Router is a returned object, not markup. Next resolves
 * `generateMetadata` as part of rendering the page and puts the tags in the
 * **initial HTML** -- which is the only version a crawler that does not run
 * JavaScript will ever see, and those are the crawlers this product is for. A
 * component rendering `<meta>` tags into the body would not be in the head, and
 * a client component setting `document.title` would not be in the response at
 * all.
 *
 * ## Calling it costs nothing extra
 *
 * `generateMetadata` and the page component both need the article, and both
 * fetching it is the obvious worry. It is not one: `fetch` GETs with the same
 * URL and options are memoised across `generateMetadata`, layouts and the page
 * within a single render pass, so the second call is the first call's result.
 * That is why this package hands you a function of an article rather than
 * asking you to thread one down from the metadata into the page.
 */

export interface ArticleMetadataOptions {
  /** The article. Either shape -- the body is not used. */
  readonly article: Article | ArticleBody;
  /**
   * The canonical address of this page on *your* site.
   *
   * Absolute, or relative to the `metadataBase` in your root layout. Worth
   * passing: it is what stops the same article being indexed separately under
   * every query string that reaches it.
   */
  readonly url?: string;
  /** Your site's name, for `og:site_name`. */
  readonly siteName?: string;
  /** e.g. `"nl_NL"`. */
  readonly locale?: string;
}

export const articleMetadata = ({
  article,
  url,
  siteName,
  locale,
}: ArticleMetadataOptions): Metadata => {
  /*
   * The meta description if there is one, the excerpt if there is not.
   *
   * They are different fields on purpose -- the description is written for a
   * search result and the excerpt is the line under a title in a list -- so
   * this is a fallback and not an equivalence. It exists because the failure it
   * prevents is worse than the imprecision it accepts: a page with no
   * description at all gets whatever sentence the search engine picks out of
   * the body, and for an article whose first line is a heading that is usually
   * the heading.
   */
  const description = article.description ?? article.excerpt ?? undefined;

  /*
   * The alt travels with the image and is not invented when it is missing.
   *
   * `imageAlt: null` means nobody has written alt text, which is not the same
   * as `alt=""`. Substituting the title here would describe the article rather
   * than the picture, in the one place a screen reader is most likely to read
   * it out.
   */
  const images = article.image
    ? [
        {
          url: article.image,
          ...(article.imageAlt === null ? {} : { alt: article.imageAlt }),
        },
      ]
    : undefined;

  return {
    title: article.title,
    ...(description ? { description } : {}),
    ...(url ? { alternates: { canonical: url } } : {}),
    openGraph: {
      /*
       * `article`, not `website`. It is what carries `article:published_time`
       * and `article:modified_time`, and those are how a reader -- or a model
       * summarising the page -- knows whether they are looking at something
       * from this week or from 2019.
       */
      type: "article",
      title: article.title,
      ...(description ? { description } : {}),
      ...(url ? { url } : {}),
      ...(siteName ? { siteName } : {}),
      ...(locale ? { locale } : {}),
      ...(article.published ? { publishedTime: article.published } : {}),
      modifiedTime: article.modified,
      ...(images ? { images } : {}),
    },
    twitter: {
      /*
       * `summary_large_image` when there is a picture and `summary` when there
       * is not. Claiming the large card without an image gets a card with a
       * blank rectangle where the picture should be.
       */
      card: article.image ? "summary_large_image" : "summary",
      title: article.title,
      ...(description ? { description } : {}),
      ...(images ? { images } : {}),
    },
  };
};

export interface BlogMetadataOptions {
  readonly title: string;
  readonly description?: string;
  readonly url?: string;
  readonly siteName?: string;
  readonly locale?: string;
}

/** The `<head>` for the index page. `website`, not `article`. */
export const blogMetadata = ({
  title,
  description,
  url,
  siteName,
  locale,
}: BlogMetadataOptions): Metadata => ({
  title,
  ...(description ? { description } : {}),
  ...(url ? { alternates: { canonical: url } } : {}),
  openGraph: {
    type: "website",
    title,
    ...(description ? { description } : {}),
    ...(url ? { url } : {}),
    ...(siteName ? { siteName } : {}),
    ...(locale ? { locale } : {}),
  },
});
