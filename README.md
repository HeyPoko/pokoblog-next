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
`renderItem` to replace the card entirely; the `<li>` and the paging stay ours.

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

## Static generation

```tsx
export async function generateStaticParams() {
  return (await poko.slugs()).map((slug) => ({ slug }));
}
```

`slugs()` walks every page. The walk is a consistent snapshot: an article
published while it runs lands in front of the walk and arrives on the next
build.

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
