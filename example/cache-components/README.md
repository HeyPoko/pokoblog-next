# The same examples, with `cacheComponents: true`

The README's "If you turn on Cache Components" section, as files a compiler
reads. Separate from `../app/` because the two are alternatives, not a
progression: an app has the flag on or off, and the pages differ.

Compiling is the smaller half of what protects this. `tsc` cannot see the
failure these files exist for -- the original examples type-check perfectly and
`next build` refuses to prerender them -- so the code here was arrived at by
building a real Next 16.3 app with the flag on, watching it fail, and fixing it
until every article prerendered. What the compiler adds is that the fix cannot
rot silently against a `next/cache` API that moves.
