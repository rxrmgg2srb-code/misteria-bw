const ALLOWED_TAGS = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "em",
  "h2",
  "h3",
  "i",
  "li",
  "ol",
  "p",
  "strong",
  "ul",
]);

function stripDangerousMarkup(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}

function sanitizeHref(href: string) {
  try {
    const url = new URL(href, "https://example.com");
    if (url.protocol === "http:" || url.protocol === "https:") {
      return href;
    }
  } catch {}

  return null;
}

export function sanitizeArticleHtml(html: string) {
  if (!html) {
    return "";
  }

  const cleanedHtml = stripDangerousMarkup(String(html));

  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return cleanedHtml;
  }

  const parser = new DOMParser();
  const source = parser.parseFromString(cleanedHtml, "text/html");
  const container = document.createElement("div");

  const appendNode = (parent: HTMLElement, node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.appendChild(document.createTextNode(node.textContent || ""));
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();

    if (!ALLOWED_TAGS.has(tag)) {
      Array.from(element.childNodes).forEach((child) => appendNode(parent, child));
      return;
    }

    const safeElement = document.createElement(tag);

    if (tag === "a") {
      const href = element.getAttribute("href");
      const safeHref = href ? sanitizeHref(href) : null;
      if (safeHref) {
        safeElement.setAttribute("href", safeHref);
        safeElement.setAttribute("target", "_blank");
        safeElement.setAttribute("rel", "noopener noreferrer nofollow");
      }
    }

    Array.from(element.childNodes).forEach((child) => appendNode(safeElement, child));
    parent.appendChild(safeElement);
  };

  Array.from(source.body.childNodes).forEach((node) => appendNode(container, node));
  return container.innerHTML;
}
