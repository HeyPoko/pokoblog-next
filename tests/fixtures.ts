/**
 * Responses recorded off the running API, not written from a type.
 *
 * These are the exact bytes `GET /api/connectors/:token/articles` and
 * `.../articles/:slug` answered with on 2026-08-28, whitespace and all. A
 * fixture written from the server's TypeScript would agree with that
 * TypeScript and with nothing else, and would go on agreeing with it after the
 * wire format changed.
 */

export const LIST =
  '{"articles":[{"title":"Wat Magento onderhoud kost","slug":"onderhoud","excerpt":"Kort en concreet.","description":"Wat Magento onderhoud kost in 2026.","image":"https://cdn.example/onderhoud.webp","imageAlt":"Een monteur achter een laptop","published":"2026-08-25T09:00:00.000Z","modified":"2026-08-28T21:56:33.647Z"}],"nextCursor":"MjAyNi0wOC0yNVQwOTowMDowMC4wMDBafG9uZGVyaG91ZA"}';

export const LIST_LAST =
  '{"articles":[{"title":"Zonder plaatje","slug":"zonder-plaatje","excerpt":null,"description":null,"image":null,"imageAlt":null,"published":"2026-08-24T09:00:00.000Z","modified":"2026-08-28T21:56:33.647Z"}],"nextCursor":null}';

export const ARTICLE =
  '{"title":"Wat Magento onderhoud kost","slug":"onderhoud","excerpt":"Kort en concreet.","description":"Wat Magento onderhoud kost in 2026.","image":"https://cdn.example/onderhoud.webp","imageAlt":"Een monteur achter een laptop","published":"2026-08-25T09:00:00.000Z","modified":"2026-08-28T21:56:33.647Z","html":"<p>Iets.</p>","markdown":"Iets."}';

export const BARE =
  '{"title":"Zonder plaatje","slug":"zonder-plaatje","excerpt":null,"description":null,"image":null,"imageAlt":null,"published":"2026-08-24T09:00:00.000Z","modified":"2026-08-28T21:56:33.647Z","html":"<p>Twee.</p>","markdown":null}';

export const NOT_FOUND =
  '{"code":"error.connector.noEmbed","message":"error.connector.noEmbed","status":404,"timestamp":"2026-08-28T21:56:33.753Z","path":"/api/connectors/x/articles"}';

export const BAD_CURSOR =
  '{"code":"error.connector.badCursor","message":"error.connector.badCursor","status":422,"timestamp":"2026-08-28T21:56:33.735Z","path":"/api/connectors/x/articles"}';

export interface Call {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

/** A `fetch` that answers from a script and remembers what it was asked. */
export const fakeFetch = (
  answers: readonly (readonly [status: number, body: string])[],
) => {
  const calls: Call[] = [];
  let at = 0;

  const fetcher = ((input: RequestInfo | URL, init?: RequestInit) => {
    /*
     * `Request` has no `toString` of its own, so stringifying it gives
     * "[object Request]" -- a URL assertion against that passes nothing and
     * fails confusingly. Each of the three shapes is read for its address.
     */
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

    calls.push({ url, init });

    const answer = answers[at] ?? answers[answers.length - 1];

    at += 1;

    if (answer === undefined) throw new Error(`nothing scripted for ${url}`);

    return Promise.resolve(
      new Response(answer[1], {
        status: answer[0],
        headers: { "content-type": "application/json" },
      }),
    );
  }) as typeof globalThis.fetch;

  return { fetcher, calls };
};
