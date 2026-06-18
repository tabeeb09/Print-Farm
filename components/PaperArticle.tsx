import PaperPdfEmbed from "@/components/PaperPdfEmbed";
import type { PaperDocument, PaperSection } from "@/src/lib/papers";
import { resourceUrl } from "@/src/lib/resource-schema";

function renderSection(section: PaperSection) {
  return (
    <section className="paper-section" id={section.id} key={section.id}>
      <h2>{section.title}</h2>
      {section.paragraphs.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      {section.subsections?.map(renderSection)}
    </section>
  );
}

export default function PaperArticle({ paper }: { paper: PaperDocument }) {
  const pdfUrl = paper.pdfResourceId ? resourceUrl(paper.pdfResourceId) : null;

  return (
    <article className="paper-article editorial-page">
      <header className="paper-header">
        <p className="eyebrow">{paper.label}</p>
        <h1>{paper.title}</h1>
        {paper.subtitle ? <p className="paper-standfirst">{paper.subtitle}</p> : null}
        <dl className="paper-meta">
          <div>
            <dt>Authors</dt>
            <dd>{paper.authors.join(", ")}</dd>
          </div>
          {paper.affiliations?.length ? (
            <div>
              <dt>Affiliation</dt>
              <dd>{paper.affiliations.join("; ")}</dd>
            </div>
          ) : null}
          {paper.date ? (
            <div>
              <dt>Date</dt>
              <dd>{paper.date}</dd>
            </div>
          ) : null}
        </dl>
      </header>

      {paper.preamble?.length ? (
        <section className="paper-preamble">
          {paper.preamble.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>
      ) : null}

      <section className="paper-abstract" aria-labelledby={`${paper.slug}-abstract`}>
        <h2 id={`${paper.slug}-abstract`}>Abstract</h2>
        {paper.abstract.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        <div className="paper-keywords">
          {paper.keywords.map((keyword) => (
            <span key={keyword}>{keyword}</span>
          ))}
        </div>
      </section>

      <div className="paper-layout">
        <div className="paper-main">{paper.sections.map(renderSection)}</div>
        <aside className="paper-side">
          <h2>Article resources</h2>
          <ul>
            {paper.resources?.map((resource) => {
              const href = resource.resourceId ? resourceUrl(resource.resourceId) : resource.href;

              return (
                <li key={resource.label}>
                  {href ? <a href={href}>{resource.label}</a> : resource.label}
                </li>
              );
            })}
          </ul>
        </aside>
      </div>

      {paper.figures?.length ? (
        <section className="paper-figures">
          <h2>Figures</h2>
          {paper.figures.map((figure) => {
            const href = figure.resourceId ? resourceUrl(figure.resourceId) : figure.href;

            return (
              <figure key={figure.id}>
                {href ? <img src={href} alt={figure.caption} /> : null}
                <figcaption>
                  <strong>{figure.label}.</strong> {figure.caption}
                </figcaption>
              </figure>
            );
          })}
        </section>
      ) : null}

      {pdfUrl ? (
        <section className="paper-source">
          <h2>Source PDF</h2>
          <PaperPdfEmbed url={pdfUrl} />
        </section>
      ) : null}
    </article>
  );
}
