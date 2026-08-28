# The README's examples, as files a compiler reads

Not a runnable app. These are the exact snippets from `../README.md`, in the
file layout they belong in, included in `tsconfig.json` so `tsc --noEmit` checks
them.

The reason is narrow and worth stating: the App Router changed between Next 15
and 16 in ways that make a plausible-looking example wrong — `params` is a
`Promise` now, and an example that destructures it directly compiles in the
version this package was written against and fails in the customer's. Prose in a
README cannot be type-checked. These can.

Imports are relative rather than `@/lib/…` only because there is no path alias
here; the README shows the alias because that is what a real app has.
