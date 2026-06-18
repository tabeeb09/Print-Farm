export default function Home() {
  return (
    <div className="home-page editorial-page">
      <section className="home-masthead">
        <div>
          <p className="eyebrow">Deployment simulation</p>
          <h1>Print Farm</h1>
          <p className="home-deck">
            A stub Next.js front end for testing the VPS bootstrap, self-hosted runner, and deploy
            pipeline before rolling new printer features into the live site.
          </p>
        </div>
        <figure>
          <div className="print-farm-badge">3D</div>
          <figcaption>Safe sandbox for slicing, queueing, and multi-material workflow experiments.</figcaption>
        </figure>
      </section>

      <section className="home-grid" aria-label="Print farm areas">
        <article className="lead-card">
          <p className="eyebrow">Control plane</p>
          <h2>Machine setup</h2>
          <p>
            Use this simulation environment to validate deployment changes, environment wiring,
            and operator flows without touching the production portfolio stack.
          </p>
          <a className="read-link" href="/docs">
            Open docs
          </a>
        </article>

        <div className="story-stack">
          <article className="story-card">
            <p className="eyebrow">Materials</p>
            <h2>Filament profiles</h2>
            <p>Track presets, spool identity, and color-specific usage logic for upcoming slicing features.</p>
          </article>
          <article className="story-card">
            <p className="eyebrow">Jobs</p>
            <h2>Queue simulation</h2>
            <p>Exercise upload, review, and approval flows against a deployable app skeleton.</p>
          </article>
          <article className="story-card">
            <p className="eyebrow">Operations</p>
            <h2>Bootstrap checks</h2>
            <p>Confirm that VPS provisioning, GitHub Actions, and local-runner deployment all target this repo.</p>
          </article>
        </div>
      </section>
    </div>
  );
}
