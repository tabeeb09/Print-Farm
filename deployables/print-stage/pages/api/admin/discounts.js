import { getServerSession } from "next-auth/next";

import { toFileActor } from "../../../lib/auth";
import { authOptions } from "../../../lib/authOptions";
import { recordAuditEvent } from "../../../lib/auditLog";
import { deleteDiscount, listDiscounts, saveDiscount } from "../../../lib/discountStore";
import { listPeopleGroupsForActor } from "../../../lib/keycloakAdmin";

async function requireHrActor(req, res) {
  const actor = toFileActor(await getServerSession(req, res, authOptions));
  if (!actor) return { error: { status: 401, message: "Authentication required." } };
  if (!actor.isHrAdmin) return { error: { status: 403, message: "HR admin role required." } };
  return { actor };
}

export default async function handler(req, res) {
  const { actor, error } = await requireHrActor(req, res);
  if (error) return res.status(error.status).json({ error: error.message });

  try {
    if (req.method === "GET") {
      const [discountState, groupState] = await Promise.all([listDiscounts(), listPeopleGroupsForActor(actor)]);
      return res.status(200).json({ ...discountState, groups: groupState.groups || [] });
    }
    if (req.method === "POST") {
      const result = await saveDiscount(req.body || {});
      await recordAuditEvent(actor, { action: "discount.save", targetType: "group", targetId: req.body?.groupId, metadata: req.body });
      return res.status(200).json(result);
    }
    if (req.method === "DELETE") {
      const id = String(req.query.id || req.body?.id || "");
      const result = await deleteDiscount(id);
      await recordAuditEvent(actor, { action: "discount.delete", targetType: "discount", targetId: id });
      return res.status(200).json(result);
    }
    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed." });
  } catch (caught) {
    return res.status(400).json({ error: caught instanceof Error ? caught.message : "Discount request failed." });
  }
}
