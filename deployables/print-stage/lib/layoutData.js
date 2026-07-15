export const menuItems = [
  { href: "/", title: "Home", label: "Index" },
  { href: "/files", title: "Submit prints", label: "Upload and quote" },
  { href: "/print-queue", title: "Print farm queue", label: "Operator panel", adminOnly: true },
  { href: "/assets", title: "Borrow assets", label: "Loan catalogue" },
  { href: "/assets/my-loans", title: "My bookings", label: "Loans and codes" },
  { href: "/admin/assets/catalogue", title: "Asset catalogue", label: "Loan settings", assetAdminOnly: true },
  { href: "/admin/assets/inventory", title: "Inventory", label: "On-premises assets", assetAdminOnly: true },
  { href: "/admin/assets/loans", title: "Asset loans", label: "Collections and returns", assetAdminOnly: true },
  { href: "/admin/assets/lost-damaged", title: "Lost and damaged", label: "Repair ledger", assetAdminOnly: true },
  { href: "/admin/people", title: "People", label: "Permissions", hrAdminOnly: true },
  { href: "/admin/approles", title: "OpenBao AppRoles", label: "Credential minting", openBaoAdminOnly: true },
];
