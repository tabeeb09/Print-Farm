import Head from "next/head";

import SiteShell from "../components/SiteShell";
import styles from "../styles/Home.module.css";

export default function Home() {
  return (
    <SiteShell title="3D Printer">
      <Head>
        <title>Print farm</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <section className={styles.hero}>
        <p className={styles.eyebrow}>Managed fabrication</p>
        <h1 className={styles.title}>Print farm</h1>
        <p className={styles.description}>
          Upload a model, choose a filament, receive an automatic material quote, pay, and send the
          backend-sliced job into the managed print queue.
        </p>
      </section>

      <section className={styles.grid}>
        <a href="/files" className={styles.card}>
          <p className={styles.eyebrow}>Submission</p>
          <h3>Prepare a print job</h3>
          <p>
            Add a model or advanced Orca project, let the backend slice it, review grams and
            pricing, then send it forward for production.
          </p>
        </a>

        <a href="/print-queue" className={styles.card}>
          <p className={styles.eyebrow}>Operations</p>
          <h3>Track the print farm</h3>
          <p>
            Operators can review queue order, start the next job, and keep active print work
            visible from a single panel.
          </p>
        </a>
      </section>
    </SiteShell>
  );
}
