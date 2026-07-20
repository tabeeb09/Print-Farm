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
