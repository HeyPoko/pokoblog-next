import { defineConfig } from "vitest/config";

/**
 * The suite runs under the `react-server` condition, on purpose.
 *
 * `src/components.tsx` imports `server-only`, whose whole job is to throw when
 * it is resolved *without* that condition -- which is what makes putting these
 * components in a client bundle a build error rather than a blog no crawler can
 * read. Resolving them here the way Next resolves a server component is the
 * only way to test them at all, and it is also the arrangement being asserted.
 *
 * `react/jsx-runtime` resolves to its react-server build under the same
 * condition, which is what the components are compiled against in a real app.
 *
 * Three places rather than one, and all three are load-bearing:
 *
 *   - `resolve.conditions` covers modules Vite itself transforms.
 *   - `ssr.resolve.externalConditions` covers the ones it externalises to
 *     Node's own resolver, which is where `server-only` ends up -- without it
 *     the suite fails at import with the very error the package exists to
 *     produce, which is correct behaviour arriving in the wrong place.
 *   - `test.server.deps.inline` keeps `server-only` on the first path in the
 *     versions of Vite that externalise it regardless.
 */
export default defineConfig({
  resolve: {
    conditions: ["react-server", "node", "import", "module", "default"],
  },
  ssr: {
    resolve: {
      conditions: ["react-server", "node", "import", "module", "default"],
      externalConditions: [
        "react-server",
        "node",
        "import",
        "module",
        "default",
      ],
    },
  },
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    server: {
      deps: {
        inline: ["server-only"],
      },
    },
  },
});
