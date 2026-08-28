import { revalidateTag } from "next/cache";

/**
 * Dropping the cache when PokoBlog says an article was published.
 *
 * ## `revalidateTag(tag, "max")`, with the second argument
 *
 * The one-argument `revalidateTag(tag)` that every example on the internet
 * shows is **deprecated in Next 16** and does not type-check: the signature is
 * `revalidateTag(tag: string, profile: string | CacheLifeConfig)`. `"max"` is
 * the recommended profile and gives stale-while-revalidate -- the next visitor
 * is served the copy we have while a fresh one is fetched behind them, which is
 * the right trade for a blog. `updateTag(tag)` is the other option and expires
 * the entry immediately, so the next visitor waits for the refetch; reach for
 * it only when a stale article for one request is genuinely unacceptable.
 *
 * ## Verification is left to the reader, deliberately
 *
 * Writing half of it here would be an example somebody copies. The rule, in
 * full: read the **raw bytes** before any JSON parsing, split `Poko-Signature`
 * on `,` into `t=<unix>` and `v1=<hex>`, refuse anything more than 300 seconds
 * old in either direction, compute `HMAC-SHA256(secret, t + "." + body)` as
 * lowercase hex with the whole `whsec_` string as the key, and compare with
 * `crypto.timingSafeEqual` rather than `===` -- a `===` stops at the first
 * differing byte and is a timing oracle for the secret.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  const signature = request.headers.get("poko-signature");

  if (signature === null || body === "") {
    return new Response(null, { status: 403 });
  }

  revalidateTag("pokoblog", "max");

  return new Response(null, { status: 204 });
}
