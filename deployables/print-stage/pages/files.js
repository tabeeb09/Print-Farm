import Head from "next/head";
import { getServerSession } from "next-auth/next";

import FileManager from "../components/FileManager";
import { authOptions } from "../lib/authOptions";
import { env } from "../lib/env";
import SiteShell from "../components/SiteShell";

function formatBytes(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "unknown";
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(0)} MB`;
}

export default function FilesPage({ uploadLimitBytes }) {
  return (
    <SiteShell title="Print farm">
      <Head>
        <title>Submit prints | Print farm</title>
      </Head>

      <div style={{ maxWidth: "72rem", margin: "0 auto" }}>
        <h1>Submit prints</h1>
        <p style={{ maxWidth: "50rem" }}>
          Upload a model, let the backend prepare the print package, review the material estimate,
          then pay and release it into the print farm queue. Your files remain scoped to your
          Keycloak account and download links stay short-lived.
        </p>
        <p style={{ maxWidth: "50rem", color: "#555" }}>
          Processing service: <strong>Managed print pipeline</strong>
        </p>
        <p style={{ maxWidth: "50rem", color: "#555" }}>
          Account upload allowance: <strong>{formatBytes(uploadLimitBytes)}</strong>
        </p>
        <FileManager />
      </div>
    </SiteShell>
  );
}

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions);

  if (!session) {
    return {
      redirect: {
        destination: "/api/auth/signin?callbackUrl=%2Ffiles",
        permanent: false,
      },
    };
  }

  return {
    props: {
      uploadLimitBytes:
        typeof session.user?.uploadLimitBytes === "number" && session.user.uploadLimitBytes > 0
          ? session.user.uploadLimitBytes
          : env.FILE_UPLOAD_MAX_BYTES,
    },
  };
}
