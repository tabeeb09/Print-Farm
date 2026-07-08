import { getServerSession } from "next-auth/next";

import { toFileActor } from "../../../../lib/auth";
import { authOptions } from "../../../../lib/authOptions";
import {
  assignRoleByEmail,
  ensurePersonByEmail,
  getManageableRoles,
  getPersonByEmail,
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

  if (!actor.isHrAdmin) {
    return { error: { status: 403, message: "HR admin role required." } };
  }

  return { actor };
}

export default async function handler(req, res) {
  const { error } = await requireHrActor(req, res);
  if (error) {
    return res.status(error.status).json({ error: error.message });
  }

  try {
    if (req.method === "GET") {
      const email = req.query.email ? requireEmail(req.query.email) : "";
      const person = email ? await getPersonByEmail(email) : { user: null, roles: [] };
      return res.status(200).json({ ...person, manageableRoles: getManageableRoles() });
    }

    if (req.method === "POST") {
      const email = requireEmail(req.body?.email);
      const role = String(req.body?.role || "").trim();
      const name = String(req.body?.name || "").trim();

      if (!role) {
        const person = await ensurePersonByEmail({ email, name });
        return res.status(201).json({ ...person, manageableRoles: getManageableRoles() });
      }

      const person = await assignRoleByEmail(email, role);
      return res.status(200).json({ ...person, manageableRoles: getManageableRoles() });
    }

    if (req.method === "DELETE") {
      const email = requireEmail(req.body?.email);
      const role = String(req.body?.role || "").trim();
      if (!role) {
        throw new Error("Role is required.");
      }

      const person = await removeRoleByEmail(email, role);
      return res.status(200).json({ ...person, manageableRoles: getManageableRoles() });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed." });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "People permission update failed.";
    return res.status(400).json({ error: message, manageableRoles: getManageableRoles() });
  }
}
