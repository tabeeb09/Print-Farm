export function getAppRolePresets() {
  return [
    {
      id: "print-worker",
      label: "Print worker",
      roleName: "print-worker",
      secretPath: "print/prod",
      description: "Read-only access to the print app runtime secret used by queue workers.",
    },
  ];
}
