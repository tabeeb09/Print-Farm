import Head from "next/head";
import { useState } from "react";

import { SiteNavOverlay } from "./SiteNavOverlay";
import styles from "../styles/EventPost.module.css";
import makerspaceStyles from "../styles/MakerspaceDesign.module.css";

function NavbarToggleArrow() {
  return (
    <svg className={makerspaceStyles.navToggleSvg} viewBox="0 0 7.8847664 23.537114" aria-hidden="true" focusable="false">
      <path
        className={makerspaceStyles.navToggleGlyph}
        d="M 0.3769539,0 H 0 L 7.3593758,11.699218 0.0429696,23.537109 H 0.3964559 L 7.8847668,11.697265 Z"
      />
    </svg>
  );
}

function renderInlineMarkdown(text) {
  const parts = [];
  const pattern = /(\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      parts.push(<strong key={`${match.index}-strong`}>{match[2]}</strong>);
    } else {
      parts.push(
        <a key={`${match.index}-link`} href={match[4]}>
          {match[3]}
        </a>
      );
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

function MarkdownBlock({ markdown }) {
  const blocks = markdown.trim().split(/\n{2,}/);

  return (
    <div className={styles.markdown}>
      {blocks.map((block, index) => {
        const trimmed = block.trim();
        if (trimmed.startsWith("## ")) {
          return <h2 key={index}>{renderInlineMarkdown(trimmed.slice(3))}</h2>;
        }
        if (trimmed.startsWith("# ")) {
          return <h1 key={index}>{renderInlineMarkdown(trimmed.slice(2))}</h1>;
        }
        if (trimmed.includes("\n- ")) {
          const items = trimmed
            .split("\n")
            .map((line) => line.replace(/^- /, "").trim())
            .filter(Boolean);
          return (
            <ul key={index}>
              {items.map((item) => (
                <li key={item}>{renderInlineMarkdown(item)}</li>
              ))}
            </ul>
          );
        }
        return <p key={index}>{renderInlineMarkdown(trimmed.replace(/\n/g, " "))}</p>;
      })}
    </div>
  );
}

export function EventBlogPost({ title, heroImage, heroAlt, markdown }) {
  const [siteNavOpen, setSiteNavOpen] = useState(false);

  function navigateHomeSection(section) {
    window.location.assign(`/#${section}`);
  }

  return (
    <main className={styles.page}>
      <Head>
        <title>{title} | Bath Makerspace</title>
        <meta name="description" content={`${title} event notes from Bath Makerspace.`} />
      </Head>

      <button
        type="button"
        className={makerspaceStyles.navToggle}
        data-contrast="dark"
        aria-label={siteNavOpen ? "Close makerspace navigation" : "Open makerspace navigation"}
        aria-expanded={siteNavOpen}
        aria-controls="makerspace-fixed-nav"
        onClick={() => setSiteNavOpen((open) => !open)}
      >
        <NavbarToggleArrow />
      </button>
      <SiteNavOverlay
        open={siteNavOpen}
        onClose={() => setSiteNavOpen(false)}
        onSectionNavigate={navigateHomeSection}
      />

      <article className={styles.article}>
        <header className={styles.hero}>
          <img src={heroImage} alt={heroAlt} />
          <div className={styles.heroCopy}>
            <p>Bath Makerspace events</p>
            <h1>{title}</h1>
          </div>
        </header>
        <MarkdownBlock markdown={markdown} />
      </article>
    </main>
  );
}
