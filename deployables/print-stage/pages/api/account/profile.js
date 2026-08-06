import { getServerSession } from "next-auth/next";

import { recordAuditEvent } from "../../../lib/auditLog";
import { toFileActor } from "../../../lib/auth";
import { authOptions } from "../../../lib/authOptions";
import { readAccountProfile, writeAccountProfile } from "../../../lib/accountProfiles.js";

function profileResponse(profile) {
  return {
    profile: {
      userId: profile.userId || null,
      email: profile.email || null,
      name: profile.name || null,
      thumbnailPhoto: profile.thumbnailPhoto || "",
      updatedAt: profile.updatedAt || null,
    },
  };
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  const actor = toFileActor(session);

  if (!actor) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    if (req.method === "GET") {
      const profile = await readAccountProfile(actor);
      return res.status(200).json(profileResponse(profile));
    }

    if (req.method === "PUT") {
      const profile = await writeAccountProfile(actor, {
        thumbnailPhoto: req.body?.thumbnailPhoto ?? "",
      });

      await recordAuditEvent(actor, {
        action: "account.profile.update",
        targetType: "account",
        targetId: actor.sub,
        metadata: {
          thumbnailPhotoPresent: Boolean(profile.thumbnailPhoto),
        },
      });

      return res.status(200).json({
        ok: true,
        ...profileResponse(profile),
      });
    }

    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "Method not allowed." });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Unable to update account profile.";
    return res.status(400).json({ error: message });
  }
}
