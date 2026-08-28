/**
 * The shapes `GET /api/connectors/:token/articles` actually answers with.
 *
 * Written from responses that were recorded off the running API rather than
 * from the server's own types: a type copied across agrees with the server it
 * was copied from and with nothing else, and the day the two repositories drift
 * is the day the copy stops being a check on anything.
 *
 * Every field is `readonly`. These objects come out of a network response and
 * nothing downstream has any business editing one in place -- a component that
 * did would be editing an object another component is also rendering, since a
 * `fetch` inside one render pass is memoised and hands the same value to
 * everybody who asked.
 */

/** One published article, as the list answers. No body -- see {@link ArticleBody}. */
export interface Article {
  readonly title: string;
  readonly slug: string;
  /** The line under the title in a list. Not the meta description. */
  readonly excerpt: string | null;
  /** The sentence written for a search result. Not the excerpt. */
  readonly description: string | null;
  readonly image: string | null;
  /**
   * The alt text, and `null` when there is none.
   *
   * `null` is not `alt=""`. The empty string tells a screen reader the picture
   * is decoration, which is a claim the article's author did not make. Decide
   * once, in your own component, what to do when it is null.
   */
  readonly imageAlt: string | null;
  /** ISO 8601, UTC. */
  readonly published: string | null;
  /** ISO 8601, UTC. The row's last write, which a publish also moves. */
  readonly modified: string;
}

/**
 * One article with its body.
 *
 * **`html` is the field to render.** It is the output of PokoBlog's allowlist
 * renderer and is the identical string PokoBlog writes into a WordPress post.
 *
 * **`markdown` is the source and it is not sanitized.** It is here for
 * consumers that genuinely re-render -- an MDX pipeline, a native app, a search
 * index -- and any renderer pointed at it must have raw HTML disabled. It is
 * `null` for an article written before the field existed.
 */
export interface ArticleBody extends Article {
  readonly html: string;
  readonly markdown: string | null;
}

/** One page of the list, and where the next one starts. */
export interface ArticlePage {
  readonly articles: readonly Article[];
  /** `null` on the last page, and never absent. */
  readonly nextCursor: string | null;
}

/** The error body every non-2xx on this API carries. */
export interface ApiError {
  readonly code: string;
  readonly message: string;
  readonly status: number;
}
