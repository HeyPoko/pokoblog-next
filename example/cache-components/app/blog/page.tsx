import { cacheLife, cacheTag } from "next/cache";

import { ArticleList, blogMetadata } from "../../../../src/index";
import { poko } from "../../../lib/pokoblog";

import type { Metadata } from "next";

export const metadata: Metadata = blogMetadata({
  title: "Blog",
  description: "Wat we schrijven over Magento.",
});

/**
 * The fetch has to happen inside a `use cache` scope, not merely inside a
 * cached `fetch`.
 *
 * The client already asks for the Data Cache with `next: { revalidate }`, and
 * under Cache Components that is not the same claim: only `use cache` counts as
 * cached for prerendering. Without this wrapper the build stops with
 * `Next.js encountered uncached or runtime data during prerendering`.
 */
async function CachedList() {
  "use cache";
  cacheLife("minutes");
  cacheTag("pokoblog");

  return <ArticleList client={poko} limit={20} />;
}

export default function BlogIndex() {
  return <CachedList />;
}
