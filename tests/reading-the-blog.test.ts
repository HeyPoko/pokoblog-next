import { describe, expect, it } from "vitest";

import {
  createPokoBlog,
  PokoBlogError,
  PokoBlogNotFoundError,
} from "../src/client";
import {
  ARTICLE,
  BAD_CURSOR,
  BARE,
  fakeFetch,
  LIST,
  LIST_LAST,
  NOT_FOUND,
} from "./fixtures";

const client = (fetcher: typeof globalThis.fetch) =>
  createPokoBlog({ url: "https://poko.example", token: "tok", fetch: fetcher });

describe("reading a blog from a server component", () => {
  it("gives a card everything it needs without a second call", async () => {
    const { fetcher, calls } = fakeFetch([[200, LIST]]);
    const { articles } = await client(fetcher).page({ limit: 1 });

    expect(articles[0]).toEqual({
      title: "Wat Magento onderhoud kost",
      slug: "onderhoud",
      excerpt: "Kort en concreet.",
      description: "Wat Magento onderhoud kost in 2026.",
      image: "https://cdn.example/onderhoud.webp",
      imageAlt: "Een monteur achter een laptop",
      published: "2026-08-25T09:00:00.000Z",
      modified: "2026-08-28T21:56:33.647Z",
    });
    expect(calls).toHaveLength(1);
  });

  it("says there is no alt text rather than inventing some", async () => {
    const { fetcher } = fakeFetch([[200, BARE]]);
    const article = await client(fetcher).article("zonder-plaatje");

    expect(article.imageAlt).toBeNull();
    expect(article.image).toBeNull();
  });

  it("hands back the sanitized html and the unsanitized source", async () => {
    const { fetcher } = fakeFetch([[200, ARTICLE]]);
    const article = await client(fetcher).article("onderhoud");

    expect(article.html).toBe("<p>Iets.</p>");
    expect(article.markdown).toBe("Iets.");
  });

  it("asks the address the api actually serves", async () => {
    const { fetcher, calls } = fakeFetch([[200, LIST]]);
    await client(fetcher).page({ limit: 10 });

    expect(calls[0]?.url).toBe(
      "https://poko.example/api/connectors/tok/articles?limit=10",
    );
  });

  it("escapes a slug rather than pasting it into the path", async () => {
    const { fetcher, calls } = fakeFetch([[200, ARTICLE]]);
    await client(fetcher).article("een/twee?drie");

    expect(calls[0]?.url).toBe(
      "https://poko.example/api/connectors/tok/articles/een%2Ftwee%3Fdrie",
    );
  });

  it("caches for as long as pokoblog says it may, without being asked", async () => {
    /*
     * `fetch` in Next 16 does not cache unless told to, so a client that passed
     * no options would make one request per visitor for a list that changes
     * twice a week. The default matches the `max-age=300` the API sends.
     */
    const { fetcher, calls } = fakeFetch([[200, LIST]]);
    await client(fetcher).page();

    expect(calls[0]?.init).toMatchObject({ next: { revalidate: 300 } });
  });

  it("passes the tags a webhook route would revalidate by", async () => {
    const { fetcher, calls } = fakeFetch([[200, LIST]]);
    const poko = createPokoBlog({
      url: "https://poko.example",
      token: "tok",
      revalidate: false,
      tags: ["pokoblog"],
      fetch: fetcher,
    });

    await poko.page();

    expect(calls[0]?.init).toMatchObject({
      next: { revalidate: false, tags: ["pokoblog"] },
    });
  });

  it("says the address reaches nothing rather than returning an empty blog", async () => {
    const { fetcher } = fakeFetch([[404, NOT_FOUND]]);

    await expect(client(fetcher).page()).rejects.toBeInstanceOf(
      PokoBlogNotFoundError,
    );
    await expect(client(fetcher).page()).rejects.toMatchObject({
      status: 404,
      code: "error.connector.noEmbed",
    });
  });

  it("refuses a cursor the server cannot read", async () => {
    const { fetcher } = fakeFetch([[422, BAD_CURSOR]]);

    await expect(
      client(fetcher).page({ cursor: "onzin" }),
    ).rejects.toMatchObject({
      status: 422,
      code: "error.connector.badCursor",
    });
  });

  it("does not report a proxy error page as an empty blog", async () => {
    const { fetcher } = fakeFetch([[200, "<html><body>502</body></html>"]]);

    await expect(client(fetcher).page()).rejects.toThrow(/check the base URL/);
  });

  it("refuses a base url that is not an address", () => {
    expect(() => createPokoBlog({ url: "poko.example", token: "tok" })).toThrow(
      TypeError,
    );
  });

  it("walks the whole blog rather than returning the first page", async () => {
    const { fetcher, calls } = fakeFetch([
      [200, LIST],
      [200, LIST_LAST],
    ]);

    const seen: string[] = [];

    for await (const article of client(fetcher).articles({ perPage: 1 })) {
      seen.push(article.slug);
    }

    expect(seen).toEqual(["onderhoud", "zonder-plaatje"]);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.url).toContain(
      "cursor=MjAyNi0wOC0yNVQwOTowMDowMC4wMDBafG9uZGVyaG91ZA",
    );
  });

  it("reads one page when the caller only wants the newest", async () => {
    const { fetcher, calls } = fakeFetch([
      [200, LIST],
      [200, LIST_LAST],
    ]);

    for await (const article of client(fetcher).articles({ perPage: 1 })) {
      expect(article.slug).toBe("onderhoud");

      break;
    }

    expect(calls).toHaveLength(1);
  });

  it("stops instead of building forever when the cursor never moves", async () => {
    /*
     * `generateStaticParams` calls `slugs()`. A walk that never ends there is a
     * deploy that never finishes and a bill that arrives later -- no error, no
     * failed build, just a job nobody is watching.
     *
     * The fake refuses a sixth request, and that bound is the point of it. A
     * client that lost this guard would make this test *hang* rather than fail,
     * and a suite that hangs reports nothing and gets blamed on the runner. The
     * mutation has to come back red in milliseconds or the guard is not covered.
     */
    let answered = 0;

    const fetcher = (() => {
      answered += 1;

      if (answered > 5)
        throw new Error("a sixth request: it is paging forever");

      return Promise.resolve(
        new Response(LIST, {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }) as typeof globalThis.fetch;

    await expect(client(fetcher).slugs()).rejects.toThrow(/did not advance/);
    expect(answered).toBe(2);
  });

  it("collects every slug for generateStaticParams", async () => {
    const { fetcher } = fakeFetch([
      [200, LIST],
      [200, LIST_LAST],
    ]);

    await expect(client(fetcher).slugs()).resolves.toEqual([
      "onderhoud",
      "zonder-plaatje",
    ]);
  });
});

describe("errors a customer has to tell apart", () => {
  it("keeps a 404 distinguishable from any other failure", () => {
    expect(new PokoBlogNotFoundError("x", null)).toBeInstanceOf(PokoBlogError);
    expect(new PokoBlogError("x", 500, null)).not.toBeInstanceOf(
      PokoBlogNotFoundError,
    );
  });
});
