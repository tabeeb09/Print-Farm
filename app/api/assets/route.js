import { NextResponse } from "next/server";

import { getAuthenticatedSession } from "@/src/lib/server/auth";
import {
  bookLoan,
  createAsset,
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
  selectLoanableListings,
  selectLostDamaged,
  selectUserLoans,
  setAssetLoanable,
  updateAsset,
  verifyCollectionCode,
  verifyReturnCode,
} from "@/src/lib/server/assetsDomain.js";
import { readAssetState, updateAssetState, writeAssetState } from "@/src/lib/server/assetsStore.js";

function actorFromSession(session) {
  if (!session?.user?.email) {
    return null;
  }

  const roles = session.user.roles || [];
  const assetAdminRoles = (process.env.KEYCLOAK_ASSET_ADMIN_ROLES || "owner,asset_admin")
    .split(",")
    .map((role) => role.trim())
    .filter(Boolean);
  return {
    sub: session.user.email,
    email: session.user.email,
    name: session.user.name || null,
    roles,
    isAssetAdmin: assetAdminRoles.some((role) => roles.includes(role)),
  };
}

async function requireActor() {
  const session = await getAuthenticatedSession();
  const actor = actorFromSession(session);

  if (!actor) {
    const error = new Error("Authentication required.");
    error.status = 401;
    throw error;
  }

  return actor;
}

function requireAssetAdmin(actor) {
  if (!actor?.isAssetAdmin) {
    const error = new Error("Asset admin role required.");
    error.status = 403;
    throw error;
  }
}

function publicActor(actor) {
  return {
    userId: actor.sub,
    userEmail: actor.email,
  };
}

function getViewPayload(state, actor, view) {
  const borrower = publicActor(actor);

  if (["catalogue", "inventory", "admin-loans", "lost-damaged", "admin"].includes(view)) {
    requireAssetAdmin(actor);
  }

  if (view === "catalogue") {
    return { catalogue: selectCatalogue(state), actor: { isAssetAdmin: actor.isAssetAdmin } };
  }

  if (view === "inventory") {
    return { inventory: selectInventory(state), actor: { isAssetAdmin: actor.isAssetAdmin } };
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

async function runAction(actor, body) {
  const payload = body && typeof body === "object" ? body : {};
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
      return createAsset(state, payload.asset || payload);
    }

    if (action === "updateAsset") {
      requireAssetAdmin(actor);
      return updateAsset(state, payload.assetId, payload.asset || payload);
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

export async function GET(request) {
  try {
    const actor = await requireActor();
    const view = String(new URL(request.url).searchParams.get("view") || "loanable");
    const state = await readAssetState();
    return NextResponse.json(getViewPayload(state, actor, view));
  } catch (error) {
    const status = error?.status || 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Asset request failed." }, { status });
  }
}

export async function POST(request) {
  try {
    const actor = await requireActor();
    const body = await request.json().catch(() => ({}));
    const result = await runAction(actor, body);
    const view = String(body?.view || "loanable");
    return NextResponse.json({
      ok: true,
      ...result,
      snapshot: getViewPayload(result.state, actor, view),
    });
  } catch (error) {
    const status = error?.status || 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Asset request failed." }, { status });
  }
}
