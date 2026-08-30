import { cacheLife, cacheTag } from "next/cache";
import { notFound } from "next/navigation";

import {
  ArticleView,
  articleMetadata,
  PokoBlogNotFoundError,
} from "../../../../../src/index";
import { poko } from "../../../../lib/pokoblog";

import type { Metadata } from "next";

type Props = { readonly params: Promise<{ readonly slug: string }> };

/**
 * Returns `null` rather than calling `notFound()`, deliberately.
 *
 * `notFound()` works by throwing, and this function's whole body is a cached
 * scope. The 404 has to be decided by the caller, outside the cache, from a
 * value the cache can hold.
 */
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

/**
 * Not optional here, unlike in the default setup.
 *
 * `await params` is runtime data, so a dynamic route with nothing to prerender
 * fails the build the same way an uncached fetch does. Giving it the slugs is
 * also the better outcome: every article becomes static HTML instead of being
 * generated on the first visit, which is the point for pages written to be
 * crawled.
 */
export async function generateStaticParams() {
  return (await poko.slugs()).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticle(slug);

  if (!article) return {};

  return articleMetadata({
    article,
    url: `https://example.com/blog/${slug}`,
    siteName: "Example",
    locale: "nl_NL",
  });
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = await getArticle(slug);

  if (!article) notFound();

  return <ArticleView article={article} />;
}
