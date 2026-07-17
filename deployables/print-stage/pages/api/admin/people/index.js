import { getServerSession } from "next-auth/next";

import { toFileActor } from "../../../../lib/auth";
import { authOptions } from "../../../../lib/authOptions";
import {
  assignRoleByEmail,
  actorCanOpenPeopleAdmin,
  ensurePersonByEmail,
  getManageableRoleOptions,
  getManageableRoles,
  getPersonByEmail,
  listPeopleGroupsForActor,
  listPeopleForActor,
  removeRoleByEmail,
} from "../../../../lib/keycloakAdmin";

function requireEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new Error("A valid email is required.");
  }
  return email;
}

async function requireHrActor(req, res) {
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

function isOwnerActor(actor) {
  return Boolean(actor?.isSuperadmin || actor?.roles?.includes("owner"));
}

function actorCanSeePerson(actor, person) {
  if (!person?.user || isOwnerActor(actor)) return true;
  const actorEmail = actor.email?.toLowerCase?.();
  return Boolean(actorEmail && person.managedBy?.includes(actorEmail));
}

export default async function handler(req, res) {
  const { actor, error } = await requireHrActor(req, res);
  if (error) {
    return res.status(error.status).json({ error: error.message });
  }

  try {
    if (req.method === "GET") {
      const email = req.query.email ? requireEmail(req.query.email) : "";
      if (!email) {
        return res.status(200).json({
          people: await listPeopleForActor(actor),
          manageableRoles: getManageableRoles(),
          roleOptions: getManageableRoleOptions(actor),
        });
      }

      const person = await getPersonByEmail(email);
      if (!actorCanSeePerson(actor, person)) {
        return res.status(403).json({ error: "This user is outside your HR management scope." });
      }

      return res.status(200).json({ ...person, manageableRoles: getManageableRoles(), roleOptions: getManageableRoleOptions(actor) });
    }

    if (req.method === "POST") {
      const email = requireEmail(req.body?.email);
      const role = String(req.body?.role || "").trim();
      const name = String(req.body?.name || "").trim();
      const managerEmail = isOwnerActor(actor)
        ? String(req.body?.managerEmail || actor.email || "").trim().toLowerCase()
        : actor.email;
      const existing = await getPersonByEmail(email);

      if (!actorCanSeePerson(actor, existing)) {
        return res.status(403).json({ error: "This user is outside your HR management scope." });
      }

      if (!role) {
        const person = await ensurePersonByEmail({ email, name, managerEmail });
        return res.status(201).json({ ...person, manageableRoles: getManageableRoles(), roleOptions: getManageableRoleOptions(actor) });
      }

      const person = await assignRoleByEmail(email, role, managerEmail, actor);
      return res.status(200).json({ ...person, manageableRoles: getManageableRoles(), roleOptions: getManageableRoleOptions(actor) });
    }

    if (req.method === "DELETE") {
      const email = requireEmail(req.body?.email);
      const role = String(req.body?.role || "").trim();
      if (!role) {
        throw new Error("Role is required.");
      }

      const existing = await getPersonByEmail(email);
      if (!actorCanSeePerson(actor, existing)) {
        return res.status(403).json({ error: "This user is outside your HR management scope." });
      }

      const person = await removeRoleByEmail(email, role, actor);
      return res.status(200).json({ ...person, manageableRoles: getManageableRoles(), roleOptions: getManageableRoleOptions(actor) });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed." });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "People permission update failed.";
    return res.status(400).json({ error: message, manageableRoles: getManageableRoles(), roleOptions: getManageableRoleOptions(actor) });
  }
}
