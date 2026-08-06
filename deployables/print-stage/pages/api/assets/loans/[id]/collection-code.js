import { getServerSession } from "next-auth/next";

import { recordAuditEvent } from "../../../../../lib/auditLog";
import { toFileActor } from "../../../../../lib/auth";
import { authOptions } from "../../../../../lib/authOptions";
import { readAssetState } from "../../../../../lib/assetsStore.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const session = await getServerSession(req, res, authOptions);
  const actor = toFileActor(session);

  if (!actor) {
    return res.status(401).json({ error: "Authentication required." });
  }

  if (!actor.isAssetAdmin || !actor.isCollectionCodeOverrideAdmin) {
    return res.status(403).json({ error: "Collection code override role required." });
  }

  const loanId = String(req.query.id || "").trim();
  if (!loanId) {
    return res.status(400).json({ error: "Loan id is required." });
  }

  const state = await readAssetState();
  const loan = (state.loans || []).find((entry) => entry.id === loanId && !entry.deletedAt);

  if (!loan) {
    return res.status(404).json({ error: "Loan not found." });
  }

  const asset = (state.assets || []).find((entry) => entry.id === loan.assetId);

  await recordAuditEvent(actor, {
    action: "asset.collection_code.reveal",
    targetType: "loan",
    targetId: loan.id,
    metadata: {
      assetId: loan.assetId,
      assetName: asset?.name || null,
      borrowerId: loan.userId || null,
      borrowerEmail: loan.userEmail || null,
      loanStatus: loan.status || null,
    },
  });

  return res.status(200).json({
    ok: true,
    collectionCode: loan.collectionCode || "",
  });
}
