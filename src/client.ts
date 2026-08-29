import type { ApiError, Article, ArticleBody, ArticlePage } from "./types.js";

/**
 * Reading a PokoBlog blog from a Next.js server component.
 *
 * ## Everything here runs on the server, and that is the product
 *
 * These articles exist to be found by search engines and by AI crawlers.
 * GPTBot, ClaudeBot and PerplexityBot fetch HTML and read what comes back; they
 * do not run JavaScript. A blog fetched in the browser after hydration is, to
 * every one of them, an empty div -- which is the exact failure the embed
 * widget has and the reason this package exists beside it.
 *
 * So there is no `"use client"` anywhere in this package, no hook, and no
 * `useEffect`. The functions here are `async` and are meant to be awaited
 * inside a server component, which is the App Router default: a component
 * without `"use client"` renders on the server and its output is in the HTML.
 * Nothing has to be configured to get that; it has to be *avoided* to lose it.
 *
 * The one way to lose it is to call these from a component that has
 * `"use client"` at the top. `./components` imports `server-only` so that this
 * fails the build instead of shipping a blog nothing can read.
 *
 * ## Caching
 *
 * `fetch` in Next 16 does not cache unless asked, so this asks: `revalidate`
 * defaults to 300 seconds, matching the `max-age` PokoBlog itself sends. Two
 * consequences worth knowing:
 *
 * - Two calls for the same URL in one render pass are **memoised** into one
 *   request. That is what makes calling `article()` in both `generateMetadata`
 *   and the page component free, and it is why this package does not ask you to
 *   thread the article down from one to the other.
 * - `tags` lets you drop the cache on demand with `revalidateTag()`, which is
 *   what to call from a route handler receiving PokoBlog's publish webhook.
 */

/** The API's own default page size, and its ceiling. Outside 1..100 is a 422. */
export const PAGE = 50;
export const MAX_PAGE = 100;

export interface PokoBlogOptions {
  /** The origin PokoBlog is served from, e.g. `https://app.example.com`. */
  readonly url: string;
  /** The **embed** connector's token, from Connections → Embed. */
  readonly token: string;
  /**
   * Seconds before a cached answer is refetched. `false` caches indefinitely,
   * which is what a build that revalidates by tag wants; `0` disables caching.
   */
  readonly revalidate?: number | false;
  /** Cache tags, for `revalidateTag()` from a webhook route handler. */
  readonly tags?: readonly string[];
  /** Swappable for tests. Defaults to the global `fetch`. */
  readonly fetch?: typeof globalThis.fetch;
}

/** Something the API said no to. `code` is the stable part; branch on it. */
export class PokoBlogError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(message: string, status: number, code: string | null) {
    super(message);
    this.name = "PokoBlogError";
    this.status = status;
    this.code = code;
  }
}

/**
 * The address reaches nothing.
 *
 * Deliberately ambiguous at the server and the ambiguity travels: a rotated
 * token, a disconnected embed connector, a slug that is still a draft and a
 * slug that never existed all answer this. That is what stops a stranger
 * confirming a draft's address by asking for it.
 *
 * In a page, this is the one to turn into `notFound()`.
 */
export class PokoBlogNotFoundError extends PokoBlogError {
  constructor(message: string, code: string | null) {
    super(message, 404, code);
    this.name = "PokoBlogNotFoundError";
  }
}

export interface PokoBlogClient {
  /** One page of articles, newest first. */
  readonly page: (options?: {
    readonly limit?: number;
    readonly cursor?: string;
  }) => Promise<ArticlePage>;
  /** Every article, paging handled. Lazy: stop reading and it stops fetching. */
  readonly articles: (options?: {
    readonly perPage?: number;
  }) => AsyncGenerator<Article, void, undefined>;
  /** One article, body and all. */
  readonly article: (slug: string) => Promise<ArticleBody>;
  /** Every slug, for `generateStaticParams`. */
  readonly slugs: () => Promise<string[]>;
  readonly listUrl: (options?: {
    readonly limit?: number;
    readonly cursor?: string;
  }) => string;
  readonly articleUrl: (slug: string) => string;
}

export const createPokoBlog = ({
  url,
  token,
  revalidate = 300,
  tags,
  fetch: fetcher = globalThis.fetch,
}: PokoBlogOptions): PokoBlogClient => {
  const base = url.replace(/\/+$/, "");

  if (!/^https?:\/\//i.test(base)) {
    throw new TypeError("PokoBlog: `url` must be an absolute http(s) address");
  }

  if (token.trim() === "") {
    throw new TypeError("PokoBlog: `token` is empty");
  }

  const endpoint = (path: string) =>
    `${base}/api/connectors/${encodeURIComponent(token)}/${path}`;

  const listUrl = ({
    limit = PAGE,
    cursor,
  }: { readonly limit?: number; readonly cursor?: string } = {}) => {
    const query = new URLSearchParams({ limit: String(limit) });

    if (cursor !== undefined) query.set("cursor", cursor);

    return `${endpoint("articles")}?${query.toString()}`;
  };

  const articleUrl = (slug: string) =>
    endpoint(`articles/${encodeURIComponent(slug)}`);

  const read = async (target: string): Promise<unknown> => {
    const response = await fetcher(target, {
      headers: { accept: "application/json" },
      /*
       * `next` rather than `cache`, because the two conflict: Next ignores both
       * and warns in development when a request sets `revalidate` beside
       * `cache: "no-store"`. One knob, and `revalidate: 0` is how you turn
       * caching off.
       */
      next: { revalidate, ...(tags ? { tags: [...tags] } : {}) },
    });

    if (!response.ok) throw await failure(response);

    /*
     * A 200 whose body is not JSON is not a parse error, it is the wrong
     * address answering: a captive portal, a login wall, a load balancer error
     * page, a base URL with a typo in it. Left alone, the caller gets
     * `Unexpected token '<'` from deep inside `Response.json`, which names
     * neither the cause nor the URL -- and the URL is the answer almost every
     * time.
     */
    try {
      return (await response.json()) as unknown;
    } catch {
      throw malformed("JSON");
    }
  };

  const page = async (options?: {
    readonly limit?: number;
    readonly cursor?: string;
  }): Promise<ArticlePage> => asPage(await read(listUrl(options)));

  async function* articles({
    perPage = PAGE,
  }: { readonly perPage?: number } = {}): AsyncGenerator<
    Article,
    void,
    undefined
  > {
    let cursor: string | undefined;

    for (;;) {
      const current: ArticlePage = await page({
        limit: perPage,
        ...(cursor ? { cursor } : {}),
      });

      yield* current.articles;

      if (current.nextCursor === null) return;

      /*
       * A cursor that does not move is an infinite loop, and an infinite loop
       * inside `generateStaticParams` is a build that never finishes. The API
       * cannot produce one -- the cursor is built from the last row of the page
       * -- which is exactly why it is checked rather than trusted: what sits
       * between this and the API is a customer's CDN or a proxy.
       */
      if (current.nextCursor === cursor) {
        throw new PokoBlogError(
          "PokoBlog: the cursor did not advance; refusing to page forever",
          200,
          null,
        );
      }

      cursor = current.nextCursor;
    }
  }

  return {
    page,
    articles,
    article: async (slug) => asArticleBody(await read(articleUrl(slug))),
    slugs: async () => {
      const found: string[] = [];

      for await (const article of articles({ perPage: MAX_PAGE })) {
        found.push(article.slug);
      }

      return found;
    },
    listUrl,
    articleUrl,
  };
};

const failure = async (response: Response): Promise<PokoBlogError> => {
  /*
   * Read defensively. A 502 usually comes from something in front of the API
   * and its body is usually HTML, so a `json()` that throws must not replace
   * the status the caller needs to see.
   */
  let body: Partial<ApiError> = {};

  try {
    body = (await response.json()) as Partial<ApiError>;
  } catch {
    body = {};
  }

  const code = typeof body.code === "string" ? body.code : null;
  const described = `PokoBlog answered ${response.status}${code ? ` (${code})` : ""}`;

  return response.status === 404
    ? new PokoBlogNotFoundError(described, code)
    : new PokoBlogError(described, response.status, code);
};

/*
 * Narrowing rather than casting.
 *
 * `as ArticlePage` would compile and would be a lie the moment anything but the
 * API answers on that address -- a captive portal, a proxy error page, a base
 * URL with a typo. The first symptom of the cast version is `articles.map is
 * not a function` inside a render, which names neither the cause nor the URL.
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const malformed = (what: string) =>
  new PokoBlogError(
    `PokoBlog: the response is not ${what}; check the base URL`,
    200,
    null,
  );

const asArticle = (value: unknown): Article => {
  if (!isRecord(value)) throw malformed("an article");

  const {
    title,
    slug,
    excerpt,
    description,
    image,
    imageAlt,
    published,
    modified,
  } = value;

  if (
    typeof title !== "string" ||
    typeof slug !== "string" ||
    typeof modified !== "string"
  ) {
    throw malformed("an article");
  }

  return {
    title,
    slug,
    excerpt: nullableString(excerpt),
    description: nullableString(description),
    image: nullableString(image),
    imageAlt: nullableString(imageAlt),
    published: nullableString(published),
    modified,
  };
};

const asArticleBody = (value: unknown): ArticleBody => {
  if (!isRecord(value) || typeof value.html !== "string") {
    throw malformed("an article with a body");
  }

  return {
    ...asArticle(value),
    html: value.html,
    markdown: nullableString(value.markdown),
  };
};

const asPage = (value: unknown): ArticlePage => {
  if (!isRecord(value) || !Array.isArray(value.articles))
    throw malformed("a listing");

  const { nextCursor } = value;

  if (nextCursor !== null && typeof nextCursor !== "string")
    throw malformed("a listing");

  return {
    articles: value.articles.map(asArticle),
    nextCursor,
  };
};

const nullableString = (value: unknown): string | null =>
  typeof value === "string" ? value : null;
