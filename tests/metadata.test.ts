import { describe, expect, it } from "vitest";

import { articleMetadata, blogMetadata } from "../src/metadata";
import { ARTICLE, BARE } from "./fixtures";

import type { ArticleBody } from "../src/types";

/**
 * The `<head>` a crawler reads.
 *
 * Named for what a share, a search result or a model summarising the page gets,
 * because that is the whole reason these tags are set.
 */

const article = JSON.parse(ARTICLE) as ArticleBody;
const bare = JSON.parse(BARE) as ArticleBody;

describe("the head of an article page", () => {
  it("titles the tab and the search result with the article", () => {
    expect(articleMetadata({ article }).title).toBe(
      "Wat Magento onderhoud kost",
    );
  });

  it("uses the sentence written for a search result, not the teaser", () => {
    /*
     * The excerpt and the meta description are different fields on purpose --
     * one is the line under a title in a list, the other is written for a
     * search result. Preferring the excerpt would put the teaser in every
     * search result and the search-result sentence nowhere.
     */
    expect(articleMetadata({ article }).description).toBe(
      "Wat Magento onderhoud kost in 2026.",
    );
  });

  it("falls back to the excerpt rather than leaving the description empty", () => {
    /*
     * A page with no description gets whatever sentence the search engine picks
     * out of the body, and for an article beginning with a heading that is
     * usually the heading.
     */
    const without: ArticleBody = { ...article, description: null };

    expect(articleMetadata({ article: without }).description).toBe(
      "Kort en concreet.",
    );
  });

  it("says nothing rather than something empty when there is neither", () => {
    expect(articleMetadata({ article: bare }).description).toBeUndefined();
    expect(
      articleMetadata({ article: bare }).openGraph?.description,
    ).toBeUndefined();
  });

  it("marks the page as an article so its dates travel with it", () => {
    /*
     * `og:type: article` is what carries `article:published_time` and
     * `article:modified_time`. Typed as a website, an article from 2019 and one
     * from this week are indistinguishable to anything reading the head.
     */
    const openGraph = articleMetadata({ article }).openGraph;

    expect(openGraph).toMatchObject({
      type: "article",
      publishedTime: "2026-08-25T09:00:00.000Z",
      modifiedTime: "2026-08-28T21:56:33.647Z",
    });
  });

  it("puts the picture in the share card with the alt text the author wrote", () => {
    expect(articleMetadata({ article }).openGraph?.images).toEqual([
      {
        url: "https://cdn.example/onderhoud.webp",
        alt: "Een monteur achter een laptop",
      },
    ]);
  });

  it("does not invent alt text for a picture that has none", () => {
    const unlabelled: ArticleBody = { ...article, imageAlt: null };
    const images = articleMetadata({ article: unlabelled }).openGraph?.images;

    expect(images).toEqual([{ url: "https://cdn.example/onderhoud.webp" }]);
  });

  it("asks for a small card when there is no picture to put in a large one", () => {
    /*
     * Claiming `summary_large_image` without an image gets a card with a blank
     * rectangle where the picture should be.
     */
    expect(articleMetadata({ article }).twitter).toMatchObject({
      card: "summary_large_image",
    });
    expect(articleMetadata({ article: bare }).twitter).toMatchObject({
      card: "summary",
    });
  });

  it("names one canonical address so the same article is not indexed twice", () => {
    const metadata = articleMetadata({
      article,
      url: "https://disrex.nl/blog/onderhoud",
    });

    expect(metadata.alternates?.canonical).toBe(
      "https://disrex.nl/blog/onderhoud",
    );
    expect(metadata.openGraph?.url).toBe("https://disrex.nl/blog/onderhoud");
  });

  it("carries the site name and locale when the site gives them", () => {
    const metadata = articleMetadata({
      article,
      siteName: "Disrex",
      locale: "nl_NL",
    });

    expect(metadata.openGraph).toMatchObject({
      siteName: "Disrex",
      locale: "nl_NL",
    });
  });

  it("still describes an article that has never been published", () => {
    const draftish: ArticleBody = { ...article, published: null };
    const openGraph = articleMetadata({ article: draftish }).openGraph;

    expect(openGraph).not.toHaveProperty("publishedTime");
    expect(openGraph).toMatchObject({ modifiedTime: article.modified });
  });
});

describe("the head of the blog index", () => {
  it("is a website and not an article", () => {
    expect(blogMetadata({ title: "Blog" }).openGraph).toMatchObject({
      type: "website",
      title: "Blog",
    });
  });
});
