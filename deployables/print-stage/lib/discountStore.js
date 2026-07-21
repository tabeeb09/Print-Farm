import { getStateFilePath, readJsonFile, writeJsonFile } from "./jsonStore.js";

const DISCOUNT_PATH = getStateFilePath("DISCOUNTS_STORE_PATH", "discounts.json");

function normalizeDiscount(input) {
  const percent = Math.max(0, Math.min(100, Number(input.percentOff) || 0));
  return {
    id: input.id || crypto.randomUUID(),
    groupId: String(input.groupId || "").trim(),
    groupName: String(input.groupName || "").trim(),
    percentOff: percent,
    description: String(input.description || "").trim(),
    active: input.active !== false,
    updatedAt: new Date().toISOString(),
  };
}

export async function listDiscounts() {
  return readJsonFile(DISCOUNT_PATH, { discounts: [] });
}

export function selectBestDiscountForGroups(discounts, groups = []) {
  const groupIds = new Set((groups || []).map((group) => String(group?.id || "").trim()).filter(Boolean));
  const groupNames = new Set(
    (groups || [])
      .flatMap((group) => [group?.name, group?.path])
      .map((value) => String(value || "").replace(/^\//, "").trim().toLowerCase())
      .filter(Boolean),
  );

  return (discounts || [])
    .filter((discount) => discount?.active !== false)
    .filter((discount) => {
      const groupId = String(discount.groupId || "").trim();
      const groupName = String(discount.groupName || "").replace(/^\//, "").trim().toLowerCase();
      return (groupId && groupIds.has(groupId)) || (groupName && groupNames.has(groupName));
    })
    .sort((left, right) => Number(right.percentOff || 0) - Number(left.percentOff || 0))[0] || null;
}

export async function saveDiscount(input) {
  const state = await listDiscounts();
  const nextDiscount = normalizeDiscount(input);
  if (!nextDiscount.groupId || !nextDiscount.groupName || nextDiscount.percentOff <= 0) {
    throw new Error("Group and positive discount percentage are required.");
  }
  const discounts = (state.discounts || []).filter((item) => item.id !== nextDiscount.id);
  discounts.unshift(nextDiscount);
  return writeJsonFile(DISCOUNT_PATH, { discounts });
}

export async function deleteDiscount(id) {
  const state = await listDiscounts();
  return writeJsonFile(DISCOUNT_PATH, {
    discounts: (state.discounts || []).filter((item) => item.id !== id),
  });
}
