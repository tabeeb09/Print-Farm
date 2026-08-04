function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function scalarToXml(key, value) {
  if (value === null || value === undefined) {
    return `<${key} />`;
  }
  if (Array.isArray(value)) {
    return `<${key}>${value.map((item) => valueToXml("item", item)).join("")}</${key}>`;
  }
  if (typeof value === "object") {
    return valueToXml(key, value);
  }
  return `<${key}>${escapeXml(value)}</${key}>`;
}

function valueToXml(key, value) {
  if (Array.isArray(value)) {
    return `<${key}>${value.map((item) => valueToXml("item", item)).join("")}</${key}>`;
  }
  if (value && typeof value === "object") {
    return `<${key}>${Object.entries(value).map(([childKey, childValue]) => scalarToXml(childKey, childValue)).join("")}</${key}>`;
  }
  return scalarToXml(key, value);
}

export function inventoryExportToXml(payload) {
  return `<?xml version="1.0" encoding="UTF-8"?>${valueToXml("inventoryExport", payload)}`;
}
