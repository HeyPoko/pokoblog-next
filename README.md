# PokoBlog for Next.js

Server components and metadata helpers for rendering a PokoBlog blog in the App
Router. Built and tested against **Next.js 16.3**.

## Installing

```sh
npm install @pokoblog/next
```

Peer dependencies: `next@^16`, `react@^19`.

## Everything here runs on the server

That is not a default this package picked; it is the product. These articles
exist to be found by search engines and by AI crawlers, and GPTBot, ClaudeBot
and PerplexityBot fetch HTML and read what comes back — they do not run
JavaScript. A blog fetched in the browser after hydration is an empty div to all
of them.

So there is no `"use client"` anywhere in this package, no hook and no
`useEffect`, and `./components` imports `server-only`: put these components in a
client component and the **build fails** rather than shipping a blog nothing can
read.

## Setup

```ts
// lib/pokoblog.ts
import { createPokoBlog } from "@pokoblog/next";

export const poko = createPokoBlog({
  url: process.env.POKOBLOG_URL!,
  token: process.env.POKOBLOG_TOKEN!, // Connections → Embed
});
```

`fetch` in Next 16 does not cache unless asked, so this asks: `revalidate`
defaults to 300 seconds, matching the `max-age` PokoBlog sends. Pass
`revalidate: false` with `tags` if you would rather cache indefinitely and drop
it from a webhook route handler with `revalidateTag()`.

## The blog index

```tsx
// app/blog/page.tsx
import { ArticleList, blogMetadata } from "@pokoblog/next";

import { poko } from "@/lib/pokoblog";

import type { Metadata } from "next";

export const metadata: Metadata = blogMetadata({
  title: "Blog",
  description: "Wat we schrijven over Magento.",
});

export default function BlogIndex() {
  return <ArticleList client={poko} limit={20} />;
}
```

One request. A card needs a title, an excerpt, a date and a picture, and the
list carries all four — there is no call per article here and there must not be
one.

`ArticleList` renders semantic HTML with no styling and no class names of ours,
because a blog index has to look like the site it is in. Pass `className`, or
`renderItem` to replace the card entirely; the `<li>` stays ours.

## Paging

`limit` is a page, not a cap on the blog. Past twenty articles the index above
shows the newest twenty and the rest are unreachable.

Use a page number, which is what a reader sees and the only thing you can build
a real pager from:

```tsx
// app/blog/page.tsx
import { ArticleList } from "@pokoblog/next";

import { poko } from "@/lib/pokoblog";

type Props = { searchParams: Promise<{ page?: string }> };

const href = (n: number) => (n === 1 ? "/blog" : `/blog?page=${n}`);

export default async function BlogIndex({ searchParams }: Props) {
  const asked = Number((await searchParams).page);
  const current = Number.isInteger(asked) && asked > 0 ? asked : 1;

  return (
    <ArticleList
      client={poko}
      limit={20}
      page={current}
      renderPagination={({ page, pages }) => {
        if (pages < 2 || page === null) return null;

        return (
          <nav aria-label="Pagination">
            {page > 1 ? (
              <a href={href(page - 1)} rel="prev">
                Newer
              </a>
            ) : null}

            {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
              <a
                key={n}
                href={href(n)}
                aria-current={n === page ? "page" : undefined}
              >
                {n}
              </a>
            ))}

            {page < pages ? (
              <a href={href(page + 1)} rel="next">
                Older
              </a>
            ) : null}
          </nav>
        );
      }}
    />
  );
}
```

`renderPagination` receives `{ page, pages, total, nextCursor, prevCursor }`.
`pages` is what lets a numbered pager draw itself; a cursor cannot tell you how
many pages there are, so `1 2 3 … 12` is only buildable from these.

It is a render prop rather than markup of ours because paging is navigation in
your site: only you know whether page two lives at `?page=2`, `/blog/page/2`, or
behind a router push. Leave it out and no links are rendered, which is right for
an index that deliberately shows one page.

### Cursors, for walking the whole blog

`cursor` and `before` are still there and are the right tool for
`generateStaticParams`, a sitemap, or an append-only "load more". An offset
shifts if an article publishes while you page, so a walk can repeat or miss one;
`cursor` means "after this exact article" and cannot. For a blog index the shift
is one article appearing on two pages once a day, which is a fair price for a
URL a reader can share.

### Two details worth getting right

A page past the end is an empty list with an honest `pages`, not an error —
redirect or say so rather than showing a blank screen.

Canonicalise a paged URL **to itself**. `/blog?page=2` should carry
`<link rel="canonical" href="…/blog?page=2">`, not one pointing at page one:
that asks Google to drop every page but the first, and the articles listed only
on them go with it.

`limit` is 1 to 50. Above 50 the API answers `422` rather than clamping, so a
typo is an error you see rather than a page quietly missing articles.

## One article, with its metadata

```tsx
// app/blog/[slug]/page.tsx
import { notFound } from "next/navigation";

import {
  ArticleView,
  articleMetadata,
  PokoBlogNotFoundError,
} from "@pokoblog/next";

import { poko } from "@/lib/pokoblog";

import type { Metadata } from "next";

// `params` is a Promise in Next 16. Awaiting it is not optional.
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  try {
    return articleMetadata({
      article: await poko.article(slug),
      url: `https://example.com/blog/${slug}`,
      siteName: "Example",
      locale: "nl_NL",
    });
  } catch (failure) {
    if (failure instanceof PokoBlogNotFoundError) return {};

    throw failure;
  }
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;

  try {
    return <ArticleView article={await poko.article(slug)} />;
  } catch (failure) {
    if (failure instanceof PokoBlogNotFoundError) notFound();

    throw failure;
  }
}
```

**Fetching the article twice costs one request.** `fetch` GETs with the same URL
and options are memoised across `generateMetadata`, layouts and the page within
one render pass. That is why this package hands you a function of an article
rather than asking you to thread one from the metadata into the page.

`articleMetadata` sets the title, the description, `og:type: article` with
`article:published_time` and `article:modified_time`, the picture with the alt
text the author wrote, and a Twitter card sized to whether there is a picture at
all. It falls back from the meta description to the excerpt — they are different
fields on purpose, but a page with no description at all gets whatever sentence
a search engine picks out of the body.

## The sitemap

Every article, not one page of them. `limit` bounds a request; `articles()`
bounds nothing — it pages until there is nothing left.

```ts
// app/sitemap.ts
import { poko } from "@/lib/pokoblog";

import type { MetadataRoute } from "next";

const SITE = "https://example.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: `${SITE}/blog`, lastModified: new Date() },
  ];

  for await (const article of poko.articles()) {
    entries.push({
      url: `${SITE}/blog/${article.slug}`,
      lastModified: article.modified,
    });
  }

  return entries;
}
```

`modified` is the article's last write, which is what `lastmod` means. Do not
use `published` — a corrected article keeps its publish date and a crawler told
nothing changed will not come back for it.

**Cache it.** Without caching this route is `ƒ Dynamic` and every crawler hit
re-walks the whole blog. Under Cache Components:

```ts
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  "use cache";
  cacheLife("hours");
  cacheTag("pokoblog");
  // …
}
```

That turns it into a `○ Static` route revalidating hourly, and it shares the
`pokoblog` tag with the index — so the publish webhook's `revalidateTag` drops
both and a new article is in the sitemap as soon as it is published. Without
Cache Components, `export const revalidate = 3600` does the same job.

Use the cursor walk here rather than `?page=`: an offset can repeat or miss an
article if something publishes mid-walk, and a sitemap that quietly omits one is
the kind of bug nobody notices.

## Static generation

```tsx
export async function generateStaticParams() {
  return (await poko.slugs()).map((slug) => ({ slug }));
}
```

`slugs()` walks every page. The walk is a consistent snapshot: an article
published while it runs lands in front of the walk and arrives on the next
build.

## If you turn on Cache Components

`cacheComponents: true` is opt-in in Next 16, and the examples above **do not
build** with it on. It is not a subtle failure — `next build` stops:

```
Error: Route "/blog/[slug]": Next.js encountered uncached or runtime data
during prerendering.
```

Two things cause it, and neither is the `fetch` caching being wrong. Under Cache
Components only `use cache` counts as cached for prerendering; the Data Cache
this package uses still caches, but it does not satisfy the prerender check. And
`await params` in a dynamic route is itself runtime data.

So: wrap the data access, and give the route its params.

```tsx
// app/blog/page.tsx
import { cacheLife, cacheTag } from "next/cache";
import { ArticleList } from "@pokoblog/next";

import { poko } from "@/lib/pokoblog";

async function CachedList() {
  "use cache";
  cacheLife("minutes");
  cacheTag("pokoblog");

  return <ArticleList client={poko} limit={20} />;
}

export default function BlogIndex() {
  return <CachedList />;
}
```

```tsx
// app/blog/[slug]/page.tsx — the parts that change
async function getArticle(slug: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag("pokoblog", `pokoblog:${slug}`);

  try {
    return await poko.article(slug);
  } catch (failure) {
    if (failure instanceof PokoBlogNotFoundError) return null;

    throw failure;
  }
}

export async function generateStaticParams() {
  return (await poko.slugs()).map((slug) => ({ slug }));
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = await getArticle(slug);

  if (!article) notFound();

  return <ArticleView article={article} />;
}
```

`notFound()` moves **outside** the cached function, which is why `getArticle`
returns `null` rather than throwing: `notFound()` works by throwing, and a
cached scope is the wrong place to do that.

`generateMetadata` calls the same `getArticle`, so the article is fetched once
for both. That is not only tidier — under Cache Components, uncached data in
`generateMetadata` is an error of its own.

Worth the trade: every article then prerenders as static HTML rather than being
generated on the first request, which is what you want for pages whose audience
is crawlers.

`cacheTag` still pairs with the webhook below; `cacheLife("minutes")` replaces
the client's `revalidate`, which the cached scope no longer consults.

### Paging under Cache Components

A pager reads `searchParams`, which is runtime data — so the build refuses to
prerender the route unless that read sits inside `<Suspense>`:

```tsx
import { Suspense } from "react";

async function Paged({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const asked = Number((await searchParams).page);

  return <CachedList page={Number.isInteger(asked) && asked > 0 ? asked : 1} />;
}

export default function BlogIndex({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Paged searchParams={searchParams} />
    </Suspense>
  );
}
```

Without the boundary: `Route "/blog": Next.js encountered uncached or runtime
data during prerendering`. With it, the shell prerenders and the list streams
in — which is what a pager actually is. Give `CachedList` the page number as an
argument so each page gets its own cache entry.

## Dropping the cache when PokoBlog publishes

```ts
// app/api/pokoblog/route.ts
import { revalidateTag } from "next/cache";

export async function POST(request: Request) {
  const body = await request.text(); // raw bytes: the signature is over these

  // Verify `Poko-Signature` before trusting this. `t=<unix>,v1=<hex>` is
  // HMAC-SHA256 over `<t>.<body>`; compare with `crypto.timingSafeEqual`,
  // never `===`, and refuse anything more than 300 seconds old.

  revalidateTag("pokoblog", "max");

  return new Response(null, { status: 204 });
}
```

Create the client with `tags: ["pokoblog"]` for this to reach it.

**The second argument is not optional in Next 16.** `revalidateTag(tag)` on its
own is deprecated and does not type-check; `"max"` gives stale-while-revalidate,
which is what a blog wants. `updateTag(tag)` expires the entry immediately
instead, at the cost of making the next visitor wait for the refetch.

## The body

`ArticleView` renders `article.html` through `dangerouslySetInnerHTML`. That is
correct here for a specific reason: `html` is the output of PokoBlog's allowlist
renderer — a closed set of tags, every scrap of text escaped on the way in — and
is the identical string PokoBlog writes into a WordPress post.

**`markdown` is not interchangeable.** It is the unsanitized source and accepts
raw HTML on purpose, because the renderer escapes it on the way out. Putting it
through this prop, or through a markdown renderer with raw HTML enabled (which
is most of them by default), undoes the sanitizing that has already happened.

## Pictures

The components use a plain `<img>`, not `next/image`, because `next/image`
requires the article CDN's hostname in `images.remotePatterns` and a component
that silently needed a config change would fail in your build with an error
about a hostname rather than about this package. Once that host is configured,
swap it in through `renderItem`.

`imageAlt` is `null` when nobody wrote alt text, which is **not** the same as
`alt=""`, and this package never substitutes the title — it describes the
article, not the picture. The rendered `<img>` uses `alt=""` for the null case,
which is the honest reading beside a heading carrying the same meaning; the
metadata omits the attribute entirely.

## The token

The token is the **embed** connector's. Rotating it invalidates every URL built
from the old one, and **disconnecting the embed connector switches this API off
too** — the widget and the JSON API are the same connector row. Both arrive as a
`PokoBlogNotFoundError`, which is deliberately indistinguishable from a slug
that does not exist.

## Tests

```sh
cd clients/nextjs && npx vitest run
npx tsc --noEmit
```

The suite runs under the `react-server` resolve condition, which is how Next
resolves a server component and the only way to load a module that imports
`server-only` at all.
