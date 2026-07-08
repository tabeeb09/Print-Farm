import { getServerSession } from "next-auth/next";

import { toFileActor } from "../../../lib/auth";
import { authOptions } from "../../../lib/authOptions";
import { mintReadOnlyAppRole } from "../../../lib/openbaoAdmin";
import { getAppRolePresets } from "../../../lib/openbaoPresets";

function findPreset(id) {
  return getAppRolePresets().find((preset) => preset.id === id);
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  const actor = toFileActor(session);

  if (!actor) {
    return res.status(401).json({ error: "Authentication required." });
  }

  if (!actor.isOpenBaoAdmin) {
    return res.status(403).json({ error: "OpenBao admin role required." });
  }

  if (req.method === "GET") {
    return res.status(200).json({
      presets: getAppRolePresets(),
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const preset = req.body?.presetId ? findPreset(req.body.presetId) : null;
    const roleName = preset?.roleName || req.body?.roleName;
    const secretPath = preset?.secretPath || req.body?.secretPath;
    const result = await mintReadOnlyAppRole({
      roleName,
      secretPath,
      secretIdTtl: req.body?.secretIdTtl || "2160h",
      tokenTtl: req.body?.tokenTtl || "1h",
      tokenMaxTtl: req.body?.tokenMaxTtl || "4h",
    });

    return res.status(201).json({
      roleName: result.roleName,
      policyName: result.policyName,
      secretPath: result.secretPath,
      roleId: result.roleId,
      secretId: result.secretId,
      envFile: result.envFile,
      warning: "SecretID is shown once. Save this file securely and rotate it if it is exposed.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to mint AppRole.";
    return res.status(400).json({ error: message });
  }
}
