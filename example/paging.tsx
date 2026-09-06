/* eslint-disable i18next/no-literal-string -- This is example code for a
   customer's own project, where our translation setup does not exist. The
   README shows the same words, and a `t("older")` here would be a call to a
   hook nobody copying this file has. */
import { ArticleList } from "../src/index";
import { poko } from "./lib/pokoblog";

const href = (n: number) => (n === 1 ? "/blog" : `/blog?page=${n}`);

type Props = {
  searchParams: Promise<{ page?: string }>;
};

/**
 * The README's paging example, compiled.
 *
 * Separate from `app/blog/page.tsx` because the two are alternatives: an index
 * shows one page or it pages, and a customer copies whichever they need.
 */
export default async function BlogIndex({ searchParams }: Props) {
  const asked = Number((await searchParams).page);
  const current = Number.isInteger(asked) && asked > 0 ? asked : 1;

  return (
    <ArticleList
      client={poko}
      limit={20}
      page={current}
      renderPagination={({ page, pages }) => {
        if (pages < 2 || page === null) return null;

        return (
          <nav aria-label="Pagination">
            {page > 1 ? (
              <a href={href(page - 1)} rel="prev">
                Newer
              </a>
            ) : null}

            {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
              <a
                key={n}
                href={href(n)}
                aria-current={n === page ? "page" : undefined}
              >
                {n}
              </a>
            ))}

            {page < pages ? (
              <a href={href(page + 1)} rel="next">
                Older
              </a>
            ) : null}
          </nav>
        );
      }}
    />
  );
}
