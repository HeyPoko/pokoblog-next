import { createPokoBlog } from "../../src/index";

/*
 * `turbo/no-undeclared-env-vars` wants these listed in the root `turbo.json`,
 * and they must not be: `clients/` is deliberately outside the pnpm workspace
 * and nothing here is built by turbo, so an entry there would describe a cache
 * key for a build that does not happen. Disabled here rather than by widening
 * the root lint config, which other packages share.
 */
export const poko = createPokoBlog({
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  url: process.env.POKOBLOG_URL ?? "https://app.pokoblog.example",
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  token: process.env.POKOBLOG_TOKEN ?? "token",
});
