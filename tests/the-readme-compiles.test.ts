import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

/**
 * The README's examples, through a compiler.
 *
 * `example/` holds the snippets from `../README.md` as real files, and
 * `tsconfig.json` includes it. This runs the check rather than leaving it to
 * whoever remembers to type `tsc`.
 *
 * It earns its two seconds because of what changed in Next 16: `params` is a
 * `Promise` now, and `revalidateTag` takes a second argument. An example
 * written the Next 15 way still *reads* correctly -- which is exactly why prose
 * review does not catch it -- and it does not compile in the customer's
 * project. Shipping that is shipping a client that does not work, in the one
 * file every customer copies first.
 */
/**
 * Where `tsc` is, which depends on where this package is checked out.
 *
 * Its own `node_modules` when the package has been installed on its own, and
 * the monorepo's root otherwise -- inside PokoBlog this package is deliberately
 * outside the workspace, so nothing installs a `node_modules` beside it and the
 * binary is three levels up. Asked of the filesystem rather than assumed: the
 * hardcoded monorepo path made this test fail with `expected NaN to be ""` in a
 * standalone checkout, which says nothing about the thing it checks.
 */
const compiler = () => {
  const candidates = [
    new URL("../node_modules/.bin/tsc", import.meta.url),
    new URL("../../../node_modules/.bin/tsc", import.meta.url),
  ].map((url) => fileURLToPath(url));

  const found = candidates.find((path) => existsSync(path));

  if (!found) {
    throw new Error(
      `no tsc found; looked in:\n  ${candidates.join("\n  ")}\nrun npm install first`,
    );
  }

  return found;
};

it("ships examples that compile against the installed next", () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const tsc = compiler();

  const result = spawnSync(tsc, ["--noEmit"], {
    cwd: root,
    encoding: "utf8",
  });

  expect(result.stdout + result.stderr).toBe("");
  expect(result.status).toBe(0);
}, 120_000);
