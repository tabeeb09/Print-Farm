import fs from "node:fs";
import path from "node:path";

import { resourceUrlFromKey } from "@/src/lib/resource-schema";

export type JatsFigure = {
  href: string;
  label: string;
  caption: string;
};

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function stripMarkup(text: string) {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/â€”/g, " - ")
    .replace(/â€™/g, "'")
    .trim();
}

export function loadNeuromorphicJatsFigures(limit = 10): JatsFigure[] {
  const xmlPath = path.join(process.cwd(), "content", "jats", "neuromorphic", "article.xml");
  if (!fs.existsSync(xmlPath)) {
    return [];
  }

  const xml = fs.readFileSync(xmlPath, "utf8");
  const hrefMatches = [...xml.matchAll(/xlink:href="([^"]+)"/g)].map((match) => match[1] ?? "");
  const graphicRefs = unique(
    hrefMatches
      .filter((href) => href.includes("/media/image"))
      .map((href) => href.split("/media/").pop())
      .filter((href): href is string => Boolean(href)),
  ).slice(0, limit);

  const captions = [...xml.matchAll(/<caption>([\s\S]*?)<\/caption>/g)].map((match) =>
    stripMarkup(match[1] ?? ""),
  );

  return graphicRefs.map((fileName, index) => ({
    href: resourceUrlFromKey(`papers/neuromorphic/jats/media/${fileName}`),
    label: `JATS figure ${index + 1}`,
    caption: captions[index] || `Imported from the neuromorphic JATS export package (${fileName}).`,
  }));
}
