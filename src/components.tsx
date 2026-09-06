import "server-only";
import type { PokoBlogClient } from "./client.js";
import type { Article, ArticleBody } from "./types.js";
import type { ReactNode } from "react";

/**
 * Server components that put a blog in the HTML.
 *
 * ## `import "server-only"` is the whole point of this file
 *
 * Everything below could be written as a client component that fetches after
 * hydration, and it would look identical in a browser and be worthless. AI
 * crawlers -- GPTBot, ClaudeBot, PerplexityBot -- fetch HTML and read what
 * comes back; they do not run JavaScript. A blog assembled after load is an
 * empty div to every one of them, which defeats the reason these articles are
 * written.
 *
 * A comment asking people not to do that would be a comment. `server-only`
 * makes it a build error: put `"use client"` at the top of a file that imports
 * this one and the build fails with React's own message instead of shipping a
 * blog nothing can read.
 *
 * ## The markup is deliberately plain
 *
 * Semantic HTML, no styling, no class names of ours. A blog index is the part
 * of a customer's site that has to look like their site, and a component with
 * opinions about that is a component people copy out of the package and edit --
 * at which point they own the paging, the dates and the alt text too.
 *
 * The parts that are *not* left to the caller are the ones with a correct
 * answer: `<time dateTime>` in a machine-readable format, alt text that is
 * absent rather than invented, and `html` rather than `markdown` in the body.
 * `renderItem` is there for when the rest is not enough.
 */

export interface ArticleListProps {
  readonly client: PokoBlogClient;
  /** How many to show. 1 to 50; defaults to the API's page size of 50. */
  readonly limit?: number;
  /**
   * Which page: a `nextCursor` from the page before this one.
   *
   * `| undefined` explicitly, and not for tidiness. This value comes from
   * `searchParams` in every real use, where it is `string | undefined`, and
   * under `exactOptionalPropertyTypes` a bare `?:` rejects exactly that --
   * so the obvious line in the customer's own page would not compile.
   */
  readonly cursor?: string | undefined;
  /** Which page, going the other way: a `prevCursor`. Not with `cursor`. */
  readonly before?: string | undefined;
  /**
   * A page number, 1-based, for a numbered pager.
   *
   * The alternative to the two cursors, and the one a reader sees. Cursors can
   * only answer "what comes next", so "1 2 3 ... 12" and a jump to page seven
   * are only possible with this.
   */
  readonly page?: number | undefined;
  /**
   * Render the links to the pages either side of this one.
   *
   * A render prop and not markup of ours, because paging links are navigation
   * in the customer's own site: only they know whether the page lives at
   * `?cursor=`, `/blog/page/2`, or somewhere else entirely. Both cursors are
   * `null` at their respective ends, so a caller can render one link, two, or
   * none from the same function.
   *
   * Omitting it renders no links, which is right for an index that shows one
   * page on purpose -- and wrong the moment the blog outgrows `limit`, which is
   * why the README leads with it.
   */
  readonly renderPagination?: (page: {
    readonly nextCursor: string | null;
    readonly prevCursor: string | null;
    /** Which page this is, or null when it was reached by cursor. */
    readonly page: number | null;
    /** How many pages exist, so a numbered pager can draw itself. */
    readonly pages: number;
    /** How many published articles there are in total. */
    readonly total: number;
  }) => ReactNode;
  /** Where an article lives on your site. Defaults to `/blog/<slug>`. */
  readonly href?: (article: Article) => string;
  /** Replace the whole card. The `<li>` is still ours. */
  readonly renderItem?: (article: Article) => ReactNode;
  /** Rendered instead of an empty `<ul>` when there are no articles. */
  readonly empty?: ReactNode;
  readonly className?: string;
}

/**
 * The blog index, in the HTML of the response.
 *
 * One request: a card needs a title, an excerpt, a date and a picture, and the
 * list carries all four. There is no per-article call here and there must not
 * be one -- twenty bodies is a megabyte nobody asked for.
 */
export async function ArticleList({
  client,
  limit,
  cursor,
  before,
  page,
  href = (article) => `/blog/${article.slug}`,
  renderItem,
  empty,
  renderPagination,
  className,
}: ArticleListProps) {
  const {
    articles,
    nextCursor,
    prevCursor,
    page: at,
    pages,
    total,
  } = await client.page({
    ...(limit === undefined ? {} : { limit }),
    ...(cursor === undefined ? {} : { cursor }),
    ...(before === undefined ? {} : { before }),
    ...(page === undefined ? {} : { page }),
  });

  if (articles.length === 0 && empty !== undefined) return <>{empty}</>;

  const list = (
    <ul className={className}>
      {articles.map((article) => (
        <li key={article.slug}>
          {renderItem ? (
            renderItem(article)
          ) : (
            <article>
              {article.image ? (
                /*
                 * A plain `<img>`, not `next/image`. `next/image` needs the
                 * article's CDN host in `images.remotePatterns`, and a
                 * component that silently required a config change would fail
                 * at build time in the customer's project with an error about
                 * a hostname rather than about this package. Swap it in through
                 * `renderItem` once that host is configured -- it is worth
                 * doing, and it is a decision with a prerequisite.
                 *
                 * `alt=""` only when the API says there is no alt text, which
                 * is the honest reading: an unlabelled picture beside a heading
                 * that already carries the same meaning is decoration, and
                 * announcing a filename would be worse.
                 */
                // eslint-disable-next-line @next/next/no-img-element
                <img src={article.image} alt={article.imageAlt ?? ""} />
              ) : null}
              <h2>
                <a href={href(article)}>{article.title}</a>
              </h2>
              <PublishedAt article={article} />
              {article.excerpt ? <p>{article.excerpt}</p> : null}
            </article>
          )}
        </li>
      ))}
    </ul>
  );

  if (!renderPagination) return list;

  /* A fragment rather than a wrapper element: this component's markup is the
     customer's to lay out, and a div of ours here is one they cannot remove. */
  return (
    <>
      {list}
      {renderPagination({ nextCursor, prevCursor, page: at, pages, total })}
    </>
  );
}

export interface ArticleViewProps {
  readonly article: ArticleBody;
  readonly className?: string;
  /** Rendered above the body, after the heading. */
  readonly children?: ReactNode;
}

/**
 * One article, body and all, in the HTML of the response.
 *
 * Takes the article rather than fetching it, because the page around it needs
 * the same article for `generateMetadata` and passing it in makes that obvious.
 * (Fetching it here twice would in fact cost one request -- Next memoises `GET`
 * fetches within a render pass -- but a component that quietly relied on that
 * would break the moment somebody wrapped it in a cache with a different key.)
 *
 * ## `dangerouslySetInnerHTML`
 *
 * Named alarmingly and correct here, and the reason is specific rather than
 * general. `html` is the output of PokoBlog's allowlist renderer: a closed set
 * of tags with every scrap of text escaped on the way in, and it is the
 * identical string PokoBlog writes into a WordPress `wp_posts` row. Rendering
 * it is the intended use.
 *
 * `markdown` is **not** interchangeable here. It is the unsanitized source and
 * accepts raw HTML on purpose, because the renderer escapes it on the way out.
 * Putting `markdown` through this prop -- or through a markdown renderer with
 * raw HTML enabled, which is most of them by default -- undoes the sanitizing
 * this field exists to have already done.
 */
export function ArticleView({
  article,
  className,
  children,
}: ArticleViewProps) {
  return (
    <article className={className}>
      <h1>{article.title}</h1>
      <PublishedAt article={article} />
      {article.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={article.image} alt={article.imageAlt ?? ""} />
      ) : null}
      {children}
      {/*
        `poko-body` is what PokoBlog's own stylesheet is scoped to. An article
        can carry a comparison table wider than a phone and a shell command
        longer than the column, and without a rule that gives them somewhere to
        scroll they push the whole page sideways. Load the sheet from
        `/api/connectors/article.css`, or write your own against these class
        names -- the class costs nothing if you do neither.
      */}
      <div
        className="poko-body"
        dangerouslySetInnerHTML={{ __html: article.html }}
      />
    </article>
  );
}

/**
 * `<time dateTime="2026-08-25">25 augustus 2026</time>`, or nothing.
 *
 * The attribute is the machine-readable half and is what a crawler reads; the
 * text is for a person. Both, or the date is only half published -- and the
 * attribute is the ten-character date rather than the full instant, because
 * that is the form `<time>` is defined for and the one search engines parse
 * most reliably.
 *
 * `published` is null for an article with no publish date, and a `<time>` with
 * an empty `dateTime` is invalid markup, so there is nothing to render.
 */
function PublishedAt({ article }: { readonly article: Article }) {
  if (article.published === null) return null;

  const date = article.published.slice(0, 10);

  return <time dateTime={date}>{date}</time>;
}
