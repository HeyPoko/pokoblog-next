import { describe, expect, it } from "vitest";

import { createPokoBlog } from "../src/client";
import { ArticleList, ArticleView } from "../src/components";
import { ARTICLE, BARE, fakeFetch, LIST } from "./fixtures";
import { render } from "./render";

import type { ArticleBody } from "../src/types";

/**
 * What a crawler receives.
 *
 * These assert on the HTML string, not on a React tree, because the claim this
 * package makes is about the bytes in the response. GPTBot, ClaudeBot and
 * PerplexityBot fetch HTML and do not run JavaScript, so anything not in this
 * string does not exist as far as the product is concerned.
 */

const client = (body: string) =>
  createPokoBlog({
    url: "https://poko.example",
    token: "tok",
    fetch: fakeFetch([[200, body]]).fetcher,
  });

const article = JSON.parse(ARTICLE) as ArticleBody;
const bare = JSON.parse(BARE) as ArticleBody;

describe("the blog index, in the html of the response", () => {
  it("puts the article titles in the html and not in a script", async () => {
    const html = await render(await ArticleList({ client: client(LIST) }));

    expect(html).toContain("Wat Magento onderhoud kost");
    expect(html).toContain("Kort en concreet.");
    expect(html).not.toContain("<script");
  });

  it("links each article at the address the site actually serves it from", async () => {
    const html = await render(
      await ArticleList({
        client: client(LIST),
        href: (found) => `/nieuws/${found.slug}`,
      }),
    );

    expect(html).toContain('href="/nieuws/onderhoud"');
  });

  it("gives the picture the alt text the author wrote", async () => {
    const html = await render(await ArticleList({ client: client(LIST) }));

    expect(html).toContain('alt="Een monteur achter een laptop"');
  });

  it("dates each article in a form a machine can read", async () => {
    /*
     * The attribute is the half a crawler parses and the text is the half a
     * person reads. One without the other is a date that is only half
     * published.
     */
    const html = await render(await ArticleList({ client: client(LIST) }));

    expect(html).toContain('<time datetime="2026-08-25">2026-08-25</time>');
  });

  it("asks for one page and not one request per card", async () => {
    const { fetcher, calls } = fakeFetch([[200, LIST]]);
    const poko = createPokoBlog({
      url: "https://poko.example",
      token: "tok",
      fetch: fetcher,
    });

    await render(await ArticleList({ client: poko }));

    expect(calls).toHaveLength(1);
  });
});

describe("one article, in the html of the response", () => {
  it("puts the article body in the markup", async () => {
    const html = await render(ArticleView({ article }));

    expect(html).toContain("<p>Iets.</p>");
    expect(html).toContain("<h1>Wat Magento onderhoud kost</h1>");
  });

  it("renders the sanitized html and never the unsanitized source", async () => {
    /*
     * `markdown` accepts raw HTML on purpose, because PokoBlog's renderer
     * escapes it on the way out. Rendering it here instead of `html` would undo
     * the sanitizing that has already happened, which is the one way this
     * component could introduce a hole.
     */
    const dangerous: ArticleBody = {
      ...article,
      html: "<p>Veilig.</p>",
      markdown: '<img src=x onerror="alert(1)">',
    };

    const html = await render(ArticleView({ article: dangerous }));

    expect(html).toContain("<p>Veilig.</p>");
    expect(html).not.toContain("onerror");
  });

  it("leaves the alt empty when the author wrote none, rather than using the title", async () => {
    const withPicture: ArticleBody = {
      ...bare,
      image: "https://cdn.example/x.webp",
      imageAlt: null,
    };

    const html = await render(ArticleView({ article: withPicture }));

    expect(html).toContain('alt=""');
    expect(html).not.toContain(`alt="${withPicture.title}"`);
  });

  it("renders no time element for an article with no publish date", async () => {
    /*
     * A `<time>` with an empty `datetime` is invalid markup, and an invalid
     * date is worse than an absent one for the readers this is written for.
     */
    const undated: ArticleBody = { ...article, published: null };

    expect(await render(ArticleView({ article: undated }))).not.toContain(
      "<time",
    );
  });
});

describe("the guarantee that none of this runs in a browser", () => {
  it("cannot be imported into a client component", async () => {
    /*
     * Two halves, and neither is worth much alone.
     *
     * The first is that these components import `server-only`. Asserted against
     * the source because it is a build-time property: within this process the
     * module has already resolved, under the `react-server` condition this
     * suite sets, which is exactly the case where `server-only` does nothing.
     *
     * The second is that `server-only` resolved the way a *client* bundle
     * resolves it throws. Together they say: put `"use client"` at the top of a
     * file importing these and the build fails, rather than shipping a blog
     * that assembles itself after hydration and that no AI crawler will ever
     * see.
     */
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(
      new URL("../src/components.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toMatch(/^import "server-only";/m);

    /*
     * A subprocess, because conditions are a property of the resolver and this
     * suite's resolver has `react-server` set -- under which `server-only`
     * resolves to an empty module and proves nothing. A plain `node` has the
     * default conditions a client bundle has, which is the case being asserted.
     */
    const { spawnSync } = await import("node:child_process");
    const client = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", "await import('server-only')"],
      { cwd: new URL("../", import.meta.url).pathname, encoding: "utf8" },
    );

    expect(client.status).not.toBe(0);
    expect(client.stderr).toMatch(/cannot be imported from a Client Component/);
  });

  it("ships no client component of its own", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const directory = new URL("../src/", import.meta.url);

    const clientComponents = readdirSync(directory).filter((name) =>
      /^\s*["']use client["']/m.test(
        readFileSync(new URL(name, directory), "utf8"),
      ),
    );

    expect(clientComponents).toEqual([]);
  });
});
