import os from "node:os";

export function getPythonCommand() {
  const configured = process.env.PYTHON_BIN?.trim();

  if (configured) {
    const parts = configured.split(/\s+/).filter(Boolean);
    return {
      command: parts[0],
      baseArgs: parts.slice(1),
    };
  }

  if (os.platform() === "win32") {
    return {
      command: "py",
      baseArgs: ["-3"],
    };
  }

  return {
    command: "python3",
    baseArgs: [],
  };
}
