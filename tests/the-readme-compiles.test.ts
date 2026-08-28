import { spawnSync } from "node:child_process";
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
it("ships examples that compile against the installed next", () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const tsc = fileURLToPath(
    new URL("../../../node_modules/.bin/tsc", import.meta.url),
  );

  const result = spawnSync(tsc, ["--noEmit"], {
    cwd: root,
    encoding: "utf8",
  });

  expect(result.stdout + result.stderr).toBe("");
  expect(result.status).toBe(0);
}, 120_000);
