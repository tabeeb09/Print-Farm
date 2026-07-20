import { getServerSession } from "next-auth/next";

import { toFileActor } from "../../../../lib/auth";
import { authOptions } from "../../../../lib/authOptions";
import { recordAuditEvent } from "../../../../lib/auditLog";
import {
  actorCanOpenPeopleAdmin,
  deletePeopleGroup,
  getManageableRoleOptions,
  listPeopleGroupsForActor,
  savePeopleGroup,
} from "../../../../lib/keycloakAdmin";

async function requirePeopleActor(req, res) {
  const session = await getServerSession(req, res, authOptions);
  const actor = toFileActor(session);

  if (!actor) {
    return { error: { status: 401, message: "Authentication required." } };
  }

  if (!actorCanOpenPeopleAdmin(actor)) {
    const groups = await listPeopleGroupsForActor(actor);
    if (!groups.length) {
      return { error: { status: 403, message: "People admin, group admin, or delegated permission role required." } };
    }
  }

  return { actor };
}

export default async function handler(req, res) {
  const { actor, error } = await requirePeopleActor(req, res);
  if (error) {
    return res.status(error.status).json({ error: error.message });
  }

  try {
    if (req.method === "GET") {
      return res.status(200).json({
        groups: await listPeopleGroupsForActor(actor),
        roleOptions: getManageableRoleOptions(actor),
      });
    }

    if (req.method === "POST" || req.method === "PUT") {
      const group = await savePeopleGroup(actor, req.body || {});
      await recordAuditEvent(actor, {
        action: "peopleGroup.save",
        targetType: "peopleGroup",
        targetId: group?.id || req.body?.name,
        metadata: req.body,
      });
      return res.status(req.method === "POST" ? 201 : 200).json({
        group,
        groups: await listPeopleGroupsForActor(actor),
        roleOptions: getManageableRoleOptions(actor),
      });
    }

    if (req.method === "DELETE") {
      const groupId = String(req.body?.groupId || req.query?.groupId || "").trim();
      if (!groupId) {
        throw new Error("Group ID is required.");
      }

      const deleted = await deletePeopleGroup(actor, groupId);
      await recordAuditEvent(actor, {
        action: "peopleGroup.delete",
        targetType: "peopleGroup",
        targetId: groupId,
      });
      return res.status(200).json({
        ...deleted,
        groups: await listPeopleGroupsForActor(actor),
        roleOptions: getManageableRoleOptions(actor),
      });
    }

    res.setHeader("Allow", "GET, POST, PUT, DELETE");
    return res.status(405).json({ error: "Method not allowed." });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "People group update failed.";
    return res.status(400).json({ error: message, roleOptions: getManageableRoleOptions(actor) });
  }
}
