import { getServerSession } from "next-auth/next";

import { toFileActor } from "../../../../lib/auth";
import { authOptions } from "../../../../lib/authOptions";
import { recordAuditEvent } from "../../../../lib/auditLog";
import { readAssetState, updateAssetState } from "../../../../lib/assetsStore";
import {
  adjustAccountBalance,
  selectAccountBalance,
  selectAccountTransactions,
} from "../../../../lib/assetsDomain";
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

async function buildBalances(actor, state) {
  const people = await listPeopleForActor(actor);
  const balances = people.map((entry) => {
    const accountActor = {
      userId: entry.user.id,
      userEmail: entry.user.email,
    };
    const transactions = selectAccountTransactions(state, accountActor);

    return {
      user: entry.user,
      roles: entry.roles,
      managedBy: entry.managedBy,
      debts: transactions,
      transactions,
      balancePence: selectAccountBalance(state, accountActor),
    };
  });

  balances.sort((left, right) =>
    right.balancePence - left.balancePence ||
    (left.user.email || "").localeCompare(right.user.email || ""),
  );

  return balances;
}

export default async function handler(req, res) {
  const { actor, error } = await requireHrActor(req, res);
  if (error) {
    return res.status(error.status).json({ error: error.message });
  }

  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    if (req.method === "POST") {
      const payload = req.body && typeof req.body === "object" ? req.body : {};
      const result = await updateAssetState((state) =>
        adjustAccountBalance(state, payload, { id: actor.sub, email: actor.email }),
      );
      await recordAuditEvent(actor, {
        action: `balance.${payload.adjustmentType || "adjustment"}`,
        targetType: "user",
        targetId: payload.userId || payload.userEmail,
        metadata: payload,
      });
      const balances = await buildBalances(actor, result.state);
      return res.status(200).json({ ok: true, transaction: result.transaction, balances });
    }

    const state = await readAssetState();
    const balances = await buildBalances(actor, state);
    return res.status(200).json({ balances });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Unable to load balances.";
    return res.status(400).json({ error: message });
  }
}
