"use client";

import { useEffect, useRef } from "react";

export default function RevealDeck() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const deckRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!rootRef.current) return;
      if (deckRef.current) return; // guard for React StrictMode

      const Reveal = (await import("reveal.js")).default;
      const Markdown = (await import("reveal.js/plugin/markdown/markdown.esm.js")).default;
      const Notes = (await import("reveal.js/plugin/notes/notes.esm.js")).default;
      const Highlight = (await import("reveal.js/plugin/highlight/highlight.esm.js")).default;

      if (cancelled) return;

      const deck = new Reveal(rootRef.current, {
        embedded: true,
        keyboardCondition: "focused",
        hash: true,
        slideNumber: true,
        plugins: [Markdown, Notes, Highlight],
      });

      deckRef.current = deck;
      await deck.initialize();
    })();

    return () => {
      cancelled = true;
      if (deckRef.current) {
        deckRef.current.destroy(); // uninitializes + removes listeners
        deckRef.current = null;
      }
    };
  }, []);

  return (
    <div ref={rootRef} className="reveal x-reveal">
      <div className="slides">
        <section>
          <h2>Slide 1</h2>
          <p>Replace this with your content.</p>
        </section>

        <section>
          <h2>Slide 2</h2>
          <pre>
            <code className="language-js">{`console.log("code highlighting works");`}</code>
          </pre>
        </section>

        {/* Vertical stack example */}
        <section>
          <section><h2>Vertical A</h2></section>
          <section><h2>Vertical B</h2></section>
        </section>
      </div>
    </div>
  );
}
