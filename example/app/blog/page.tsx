import { ArticleList, blogMetadata } from "../../../src/index";
import { poko } from "../../lib/pokoblog";

import type { Metadata } from "next";

export const metadata: Metadata = blogMetadata({
  title: "Blog",
  description: "Wat we schrijven over Magento.",
});

export default function BlogIndex() {
  return <ArticleList client={poko} limit={20} />;
}
