export const metadata = {
  title: "Docs",
};

export default function DocsPage() {
  return (
    <article className="editorial-page paper-article">
      <header className="paper-header">
        <p className="eyebrow">Documentation</p>
        <h1>Project notes</h1>
        <p className="paper-standfirst">
          This section is reserved for longer technical notes and architecture references.
        </p>
      </header>
      <section className="paper-section">
        <h2>Current references</h2>
        <p>
          For source history and implementation details, see the{" "}
          <a href="https://github.com/tabeeb09/oi.loftrop.com">website repository</a>.
        </p>
        <p>
          Media assets are resolved through an internal resource manifest so storage backends can be changed without rewriting page content.
        </p>
      </section>
    </article>
  );
}
