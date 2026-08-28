import { Fragment } from "react/jsx-runtime";

import type { ReactNode } from "react";

/**
 * The HTML a crawler would receive, from a server component.
 *
 * A very small server renderer rather than `react-dom/server`, which does not
 * have a `react-server` build and therefore cannot be loaded in this suite at
 * all. It handles what these components produce and nothing more: host
 * elements, fragments, arrays, text, `dangerouslySetInnerHTML`, and async
 * function components, which it awaits.
 *
 * It is worth the fifty lines because the claim this package makes is about the
 * *bytes in the response* -- alt text present, `<time datetime>` machine
 * readable, the article body actually in the markup. Asserting on a React
 * element tree would be asserting on the shape of a value that no crawler ever
 * sees.
 */

const VOID = new Set(["img", "br", "hr", "input", "meta", "link", "source"]);

const ATTRIBUTE: Record<string, string> = {
  className: "class",
  dateTime: "datetime",
  htmlFor: "for",
};

const escapeText = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const escapeAttribute = (value: string) =>
  escapeText(value).replace(/"/g, "&quot;");

interface Element {
  readonly type: unknown;
  readonly props: Record<string, unknown>;
}

const isElement = (node: unknown): node is Element =>
  typeof node === "object" &&
  node !== null &&
  "type" in node &&
  "props" in node &&
  typeof (node as { props: unknown }).props === "object";

export const render = async (
  node: ReactNode | Promise<ReactNode>,
): Promise<string> => {
  const resolved = await node;

  if (
    resolved === null ||
    resolved === undefined ||
    typeof resolved === "boolean"
  ) {
    return "";
  }

  if (typeof resolved === "string") return escapeText(resolved);
  if (typeof resolved === "number") return String(resolved);

  if (Array.isArray(resolved)) {
    const parts = await Promise.all(
      resolved.map((child) => render(child as ReactNode)),
    );

    return parts.join("");
  }

  if (!isElement(resolved)) return "";

  const { type, props } = resolved;

  if (type === Fragment) return render(props.children as ReactNode);

  if (typeof type === "function") {
    const produced = (
      type as (p: Record<string, unknown>) => ReactNode | Promise<ReactNode>
    )(props);

    return render(await produced);
  }

  if (typeof type !== "string") return "";

  const attributes = Object.entries(props)
    .filter(
      ([name]) => name !== "children" && name !== "dangerouslySetInnerHTML",
    )
    .filter(
      ([, value]) => value !== undefined && value !== null && value !== false,
    )
    .map(
      ([name, value]) =>
        `${ATTRIBUTE[name] ?? name}="${escapeAttribute(String(value))}"`,
    )
    .join(" ");

  const open = attributes === "" ? type : `${type} ${attributes}`;

  if (VOID.has(type)) return `<${open}>`;

  const raw = props.dangerouslySetInnerHTML;
  const inner = isRawHtml(raw)
    ? raw.__html
    : await render(props.children as ReactNode);

  return `<${open}>${inner}</${type}>`;
};

const isRawHtml = (value: unknown): value is { __html: string } =>
  typeof value === "object" &&
  value !== null &&
  "__html" in value &&
  typeof (value as { __html: unknown }).__html === "string";
