import Head from "next/head";
import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { useState } from "react";

import SiteShell from "../../components/SiteShell";
import { toFileActor } from "../../lib/auth";
import { authOptions } from "../../lib/authOptions";
import { readAccountProfile } from "../../lib/accountProfiles.js";

const MAX_THUMBNAIL_DATA_URL_BYTES = 600_000;
const MAX_THUMBNAIL_DIMENSION = 512;

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read image."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load image."));
    image.src = src;
  });
}

async function compressThumbnail(file) {
  if (!file?.type?.startsWith("image/")) {
    throw new Error("Choose an image file.");
  }

  const image = await loadImage(await fileToDataUrl(file));
  const longestSide = Math.max(image.width, image.height) || MAX_THUMBNAIL_DIMENSION;
  const scale = Math.min(1, MAX_THUMBNAIL_DIMENSION / longestSide);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.fillStyle = "#fffaf1";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  for (const quality of [0.82, 0.72, 0.62, 0.52, 0.42]) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.length <= MAX_THUMBNAIL_DATA_URL_BYTES) return dataUrl;
  }

  throw new Error("That image is still too large after compression. Try a smaller image.");
}

export default function AccountPage({ initialProfile }) {
  const [thumbnailPhoto, setThumbnailPhoto] = useState(initialProfile.thumbnailPhoto || "");
  const [savedThumbnailPhoto, setSavedThumbnailPhoto] = useState(initialProfile.thumbnailPhoto || "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [passwordPending, setPasswordPending] = useState(false);
  const hasUnsavedChanges = thumbnailPhoto !== savedThumbnailPhoto;

  async function chooseThumbnail(event) {
    const [file] = Array.from(event.target.files || []);
    event.target.value = "";
    if (!file) return;

    setMessage("");
    setError("");

    try {
      setThumbnailPhoto(await compressThumbnail(file));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to prepare thumbnail.");
    }
  }

  async function saveProfile() {
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/account/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thumbnailPhoto }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || "Unable to save account profile.");
      }

      setThumbnailPhoto(payload.profile?.thumbnailPhoto || "");
      setSavedThumbnailPhoto(payload.profile?.thumbnailPhoto || "");
      setMessage("Account profile saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save account profile.");
    } finally {
      setSaving(false);
    }
  }

  async function requestPasswordEmail() {
    setPasswordPending(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/auth/change-password-email", {
        method: "POST",
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || "Unable to send password change email.");
      }

      setMessage(payload.message || "Password change email sent if this account supports password login.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to send password change email.");
    } finally {
      setPasswordPending(false);
    }
  }

  return (
    <SiteShell title="Account">
      <Head>
        <title>Account | 3D Printer</title>
      </Head>

      <div style={{ maxWidth: "58rem", margin: "0 auto", display: "grid", gap: "1rem" }}>
        <section className="panel" style={{ display: "grid", gap: "0.85rem" }}>
          <p className="eyebrow" style={{ margin: 0 }}>Account</p>
          <h1 style={{ margin: 0 }}>Account settings</h1>
          <p style={{ margin: 0, color: "#555" }}>
            Signed in as <strong>{initialProfile.email || "Signed-in account"}</strong>.
          </p>
          {message ? <div className="assetMessage">{message}</div> : null}
          {error ? <div className="assetError">{error}</div> : null}
        </section>

        <section className="panel accountGrid">
          <div className="accountThumbnailPreview" aria-label="Account thumbnail preview">
            {thumbnailPhoto ? <img src={thumbnailPhoto} alt="Account thumbnail" /> : <span>No photo</span>}
          </div>
          <div style={{ display: "grid", gap: "0.75rem" }}>
            <p className="eyebrow" style={{ margin: 0 }}>Profile thumbnail</p>
            <h2 style={{ margin: 0 }}>Display photo</h2>
            <p style={{ margin: 0, color: "#555" }}>
              Upload an optional account thumbnail. Images are compressed in the browser before storage.
            </p>
            <div className="accountButtonRow">
              <label className="secondaryButton">
                Choose photo
                <input type="file" accept="image/*" onChange={chooseThumbnail} hidden />
              </label>
              <button type="button" onClick={() => setThumbnailPhoto("")} disabled={!thumbnailPhoto || saving}>
                Remove photo
              </button>
              <button type="button" onClick={saveProfile} disabled={!hasUnsavedChanges || saving}>
                {saving ? "Saving..." : "Save profile"}
              </button>
            </div>
            {hasUnsavedChanges ? <p className="assetMuted" style={{ margin: 0 }}>Unsaved thumbnail change.</p> : null}
          </div>
        </section>

        <section className="panel" style={{ display: "grid", gap: "0.75rem" }}>
          <p className="eyebrow" style={{ margin: 0 }}>Account options</p>
          <div className="accountOptionList">
            <div className="accountOption">
              <div>
                <strong>Password reset email</strong>
                <p>Send a one-time password-change link to your registered email address.</p>
              </div>
              <button type="button" onClick={requestPasswordEmail} disabled={passwordPending}>
                {passwordPending ? "Sending..." : "Send password email"}
              </button>
            </div>
            <div className="accountOption">
              <div>
                <strong>Forgotten password page</strong>
                <p>Use the public recovery form if you are signed out of this account.</p>
              </div>
              <Link href="/auth/recover">Open recovery page</Link>
            </div>
          </div>
        </section>
      </div>
    </SiteShell>
  );
}

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions);
  const actor = toFileActor(session);

  if (!actor) {
    return {
      redirect: {
        destination: "/auth/signin?callbackUrl=%2Faccount",
        permanent: false,
      },
    };
  }

  const profile = await readAccountProfile(actor);

  return {
    props: {
      initialProfile: {
        email: profile.email || actor.email || "",
        name: profile.name || actor.name || "",
        thumbnailPhoto: profile.thumbnailPhoto || "",
        updatedAt: profile.updatedAt || null,
      },
    },
  };
}
