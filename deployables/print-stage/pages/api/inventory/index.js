import { getServerSession } from "next-auth/next";

import { toFileActor } from "../../../lib/auth";
import { authOptions } from "../../../lib/authOptions";
import { selectInventoryExport, selectInventoryTree } from "../../../lib/assetsDomain";
import { readAssetState } from "../../../lib/assetsStore";
import { inventoryExportToXml } from "../../../lib/inventoryExport";

function canViewInventory(actor) {
  return Boolean(actor?.isInventoryViewAdmin || actor?.isAssetAdmin);
}

function sendPayload(res, payload, format, filename = "inventory-export") {
  if (format === "xml") {
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}.xml"`);
    return res.status(200).send(inventoryExportToXml(payload));
  }

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (format === "json-download") {
    res.setHeader("Content-Disposition", `attachment; filename="${filename}.json"`);
  }
  return res.status(200).json(payload);
}

export default async function handler(req, res) {
  const actor = toFileActor(await getServerSession(req, res, authOptions));
  if (!actor) return res.status(401).json({ error: "Authentication required." });
  if (!canViewInventory(actor)) return res.status(403).json({ error: "Inventory view role required." });

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const state = await readAssetState();
  const format = String(req.query.format || "json").toLowerCase();
  const exportAll = req.query.export === "1" || ["xml", "json-download"].includes(format);
  const payload = exportAll
    ? selectInventoryExport(state)
    : selectInventoryTree(state, { groupId: req.query.groupId || null });

  return sendPayload(res, payload, format, exportAll ? "inventory-export" : "inventory-view");
}
