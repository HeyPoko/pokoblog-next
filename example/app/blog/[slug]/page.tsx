import { notFound } from "next/navigation";

import {
  ArticleView,
  articleMetadata,
  PokoBlogNotFoundError,
} from "../../../../src/index";
import { poko } from "../../../lib/pokoblog";

import type { Metadata } from "next";

/**
 * `params` is a `Promise` in Next 16, and awaiting it is not optional.
 *
 * This is the line the whole directory exists for -- and compiling is *not*
 * enough to protect it, which took a mutation to notice. Written the Next 15
 * way, `params: { readonly slug: string }`, every line below still type-checks,
 * because `await` on a value that is not a promise is legal TypeScript. The
 * example would ship reading correctly and being wrong.
 *
 * A real app does not need the assertion underneath: `next dev`, `next build`
 * and `next typegen` generate the check into `.next/types` and make
 * `PageProps<'/blog/[slug]'>` globally available, and typing the page with that
 * is what an app should do. This is a directory of example files rather than an
 * app, so there is no typegen to run and the contract is stated by hand.
 */
type Props = { readonly params: Promise<{ readonly slug: string }> };

type Expect<T extends true> = T;

export type ParamsMustBeAPromise = Expect<
  Props["params"] extends Promise<unknown> ? true : false
>;

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

export async function generateStaticParams() {
  return (await poko.slugs()).map((slug) => ({ slug }));
}
