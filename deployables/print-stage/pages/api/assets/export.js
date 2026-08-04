import { getServerSession } from "next-auth/next";

import { toFileActor } from "../../../lib/auth";
import { authOptions } from "../../../lib/authOptions";
import { selectInventoryExport } from "../../../lib/assetsDomain";
import { readAssetState } from "../../../lib/assetsStore";
import { inventoryExportToXml } from "../../../lib/inventoryExport";

export default async function handler(req, res) {
  const actor = toFileActor(await getServerSession(req, res, authOptions));
  if (!actor) return res.status(401).json({ error: "Authentication required." });
  if (!actor.isAssetAdmin) return res.status(403).json({ error: "Asset admin role required." });

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const payload = selectInventoryExport(await readAssetState());
  const format = String(req.query.format || "json").toLowerCase();

  if (format === "xml") {
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="asset-inventory-export.xml"');
    return res.status(200).send(inventoryExportToXml(payload));
  }

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="asset-inventory-export.json"');
  return res.status(200).json(payload);
}
