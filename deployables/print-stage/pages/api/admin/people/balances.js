import { getServerSession } from "next-auth/next";

import { toFileActor } from "../../../../lib/auth";
import { authOptions } from "../../../../lib/authOptions";
import { readAssetState } from "../../../../lib/assetsStore";
import { selectAccountDebts } from "../../../../lib/assetsDomain";
import { listPeopleForActor } from "../../../../lib/keycloakAdmin";

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

function debtTotalPence(debts) {
  return debts.reduce((total, debt) => total + Math.max(0, Number(debt.amountPence || 0)), 0);
}

export default async function handler(req, res) {
  const { actor, error } = await requireHrActor(req, res);
  if (error) {
    return res.status(error.status).json({ error: error.message });
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const state = await readAssetState();
    const people = await listPeopleForActor(actor);
    const balances = people.map((entry) => {
      const debts = selectAccountDebts(state, {
        userId: entry.user.id,
        userEmail: entry.user.email,
      });

      return {
        user: entry.user,
        roles: entry.roles,
        managedBy: entry.managedBy,
        debts,
        balancePence: debtTotalPence(debts),
      };
    });

    balances.sort((left, right) =>
      right.balancePence - left.balancePence ||
      (left.user.email || "").localeCompare(right.user.email || ""),
    );

    return res.status(200).json({ balances });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Unable to load balances.";
    return res.status(400).json({ error: message });
  }
}
