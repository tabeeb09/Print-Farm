import { getServerSession } from "next-auth/next";

import { toFileActor } from "../../../lib/auth";
import { authOptions } from "../../../lib/authOptions";
import { recordAuditEvent } from "../../../lib/auditLog";
import {
  bookLoan,
  createAsset,
  createInventoryGroup,
  createInventoryUnit,
  createUnitConversion,
  deleteAsset,
  deleteUnit,
  expireMissedCollections,
  extendLoan,
  markLoanLostByUser,
  markUnitsDamaged,
  recoverLostUnits,
  repairUnits,
  rescheduleLoan,
  selectAccountBalance,
  selectAccountTransactions,
  selectAdminLoans,
  selectCatalogue,
  selectInventory,
  selectInventoryTree,
  selectInventoryUnits,
  selectLoanableListings,
  selectLostDamaged,
  selectUserLoans,
  setAssetLoanable,
  updateAsset,
  verifyCollectionCode,
  verifyReturnCode,
} from "../../../lib/assetsDomain.js";
import { readAssetState, updateAssetState, writeAssetState } from "../../../lib/assetsStore.js";

async function requireActor(req, res) {
  const session = await getServerSession(req, res, authOptions);
  const actor = toFileActor(session);

  if (!actor) {
    return { error: { status: 401, message: "Authentication required." } };
  }

  return { actor };
}

function requireAssetAdmin(actor) {
  if (!actor?.isAssetAdmin) {
    const error = new Error("Asset admin role required.");
    error.status = 403;
    throw error;
  }
}

function requireInventoryUnitAdmin(actor) {
  if (!actor?.isInventoryUnitAdmin) {
    const error = new Error("Inventory unit admin role required.");
    error.status = 403;
    throw error;
  }
}

function usesNewStockUnit(state, input = {}) {
  if (!Object.prototype.hasOwnProperty.call(input, "unitLabel")) {
    return false;
  }
  const label = String(input.unitLabel || "").trim().toLowerCase();
  if (!label) return false;
  return !(state.stockUnits || []).some((unit) => !unit.deletedAt && String(unit.name || "").trim().toLowerCase() === label);
}

function publicActor(actor) {
  return {
    userId: actor.sub,
    userEmail: actor.email,
  };
}

function getViewPayload(state, actor, view) {
  const borrower = publicActor(actor);

  if (["catalogue", "inventory", "inventory-tree", "units", "admin-loans", "lost-damaged", "admin"].includes(view)) {
    requireAssetAdmin(actor);
  }

  if (view === "catalogue") {
    return {
      catalogue: selectCatalogue(state),
      ...selectInventoryUnits(state),
      actor: {
        isAssetAdmin: actor.isAssetAdmin,
        isInventoryUnitAdmin: actor.isInventoryUnitAdmin,
      },
    };
  }

  if (view === "inventory") {
    return { inventory: selectInventory(state), actor: { isAssetAdmin: actor.isAssetAdmin } };
  }

  if (view === "inventory-tree") {
    return {
      tree: selectInventoryTree(state, { groupId: actor.requestedGroupId }),
      ...selectInventoryUnits(state),
      actor: {
        isAssetAdmin: actor.isAssetAdmin,
        isInventoryUnitAdmin: actor.isInventoryUnitAdmin,
      },
    };
  }

  if (view === "units") {
    return {
      ...selectInventoryUnits(state),
      actor: {
        isAssetAdmin: actor.isAssetAdmin,
        isInventoryUnitAdmin: actor.isInventoryUnitAdmin,
      },
    };
  }

  if (view === "admin-loans") {
    return { loans: selectAdminLoans(state), actor: { isAssetAdmin: actor.isAssetAdmin } };
  }

  if (view === "lost-damaged") {
    return { entries: selectLostDamaged(state), actor: { isAssetAdmin: actor.isAssetAdmin } };
  }

  if (view === "my-loans") {
    const transactions = selectAccountTransactions(state, borrower);
    return {
      loans: selectUserLoans(state, borrower),
      debts: transactions,
      transactions,
      balancePence: selectAccountBalance(state, borrower),
      actor: { isAssetAdmin: actor.isAssetAdmin },
    };
  }

  const transactions = selectAccountTransactions(state, borrower);
  return {
    listings: selectLoanableListings(state),
    debts: transactions,
    transactions,
    balancePence: selectAccountBalance(state, borrower),
    actor: { isAssetAdmin: actor.isAssetAdmin },
  };
}

function toActionPayload(body) {
  return body && typeof body === "object" ? body : {};
}

async function runAction(actor, body) {
  const payload = toActionPayload(body);
  const action = String(payload.action || "").trim();
  const borrower = publicActor(actor);

  if (!action) {
    throw new Error("Action is required.");
  }

  if (action === "expireMissedCollections") {
    requireAssetAdmin(actor);
    const state = expireMissedCollections(await readAssetState());
    await writeAssetState(state);
    return { state };
  }

  return updateAssetState((state) => {
    if (action === "createAsset") {
      requireAssetAdmin(actor);
      const assetInput = payload.asset || payload;
      if (usesNewStockUnit(state, assetInput)) requireInventoryUnitAdmin(actor);
      return createAsset(state, assetInput);
    }

    if (action === "createInventoryGroup") {
      requireAssetAdmin(actor);
      return createInventoryGroup(state, payload.group || payload);
    }

    if (action === "createInventoryUnit") {
      requireInventoryUnitAdmin(actor);
      return createInventoryUnit(state, payload.unit || payload);
    }

    if (action === "createUnitConversion") {
      requireInventoryUnitAdmin(actor);
      return createUnitConversion(state, payload.conversion || payload);
    }

    if (action === "updateAsset") {
      requireAssetAdmin(actor);
      const assetInput = payload.asset || payload;
      if (usesNewStockUnit(state, assetInput)) requireInventoryUnitAdmin(actor);
      return updateAsset(state, payload.assetId, assetInput);
    }

    if (action === "setAssetLoanable") {
      requireAssetAdmin(actor);
      return setAssetLoanable(state, payload.assetId, payload.loanable);
    }

    if (action === "deleteAsset") {
      requireAssetAdmin(actor);
      return deleteAsset(state, payload.assetId);
    }

    if (action === "deleteUnit") {
      requireAssetAdmin(actor);
      return deleteUnit(state, payload.assetId, payload.unitId);
    }

    if (action === "adminDamageUnits") {
      requireAssetAdmin(actor);
      return markUnitsDamaged(state, payload);
    }

    if (action === "recoverLostUnits") {
      requireAssetAdmin(actor);
      return recoverLostUnits(state, payload);
    }

    if (action === "repairUnits") {
      requireAssetAdmin(actor);
      return repairUnits(state, payload);
    }

    if (action === "verifyCollectionCode") {
      requireAssetAdmin(actor);
      return verifyCollectionCode(state, {
        ...payload,
        adminId: actor.sub,
      });
    }

    if (action === "verifyReturnCode") {
      requireAssetAdmin(actor);
      return verifyReturnCode(state, {
        ...payload,
        adminId: actor.sub,
      });
    }

    if (action === "bookLoan") {
      return bookLoan(state, {
        ...payload,
        ...borrower,
      });
    }

    if (action === "rescheduleLoan") {
      return rescheduleLoan(state, {
        ...payload,
        ...borrower,
      });
    }

    if (action === "extendLoan") {
      return extendLoan(state, {
        ...payload,
        ...borrower,
      });
    }

    if (action === "markLoanLost") {
      return markLoanLostByUser(state, {
        ...payload,
        ...borrower,
      });
    }

    throw new Error(`Unknown asset action: ${action}.`);
  });
}

export default async function handler(req, res) {
  const { actor, error } = await requireActor(req, res);
  if (error) {
    return res.status(error.status).json({ error: error.message });
  }

  try {
    if (req.method === "GET") {
      const view = String(req.query.view || "loanable");
      const state = await readAssetState();
      return res.status(200).json(getViewPayload(state, { ...actor, requestedGroupId: req.query.groupId || null }, view));
    }

    if (req.method === "POST") {
      const result = await runAction(actor, req.body);
      const view = String(req.body?.view || "loanable");
      await recordAuditEvent(actor, {
        action: `asset.${String(req.body?.action || "unknown")}`,
        targetType: "asset",
        targetId: req.body?.assetId || req.body?.loanId || null,
        metadata: req.body,
      });
      return res.status(200).json({
        ok: true,
        ...result,
        snapshot: getViewPayload(result.state, { ...actor, requestedGroupId: req.body?.groupId || req.body?.asset?.groupId || null }, view),
      });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed." });
  } catch (caught) {
    const status = caught?.status || (caught?.message === "Forbidden" ? 403 : 400);
    const message = caught instanceof Error ? caught.message : "Asset request failed.";
    return res.status(status).json({ error: message });
  }
}
