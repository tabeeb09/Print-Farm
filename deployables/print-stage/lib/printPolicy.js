import path from "node:path";

export const FILAMENT_EXTRACT_VALUE = "__extract__";

export const FILAMENT_OPTIONS = [
  { value: "PLA", label: "PLA" },
  { value: "PLA+", label: "PLA+" },
  { value: "PETG", label: "PETG" },
  { value: "ABS", label: "ABS" },
  { value: "ASA", label: "ASA" },
  { value: "TPU", label: "TPU" },
  { value: "PA", label: "PA / Nylon" },
  { value: "PC", label: "PC" },
  { value: FILAMENT_EXTRACT_VALUE, label: "Extract from file (advanced)" },
];

const FILAMENT_OPTION_VALUES = new Set(FILAMENT_OPTIONS.map((option) => option.value));

export function isValidFilamentSelection(value) {
  return typeof value === "string" && FILAMENT_OPTION_VALUES.has(value);
}

export function isExtractFilamentSelection(value) {
  return value === FILAMENT_EXTRACT_VALUE;
}

export function getAllowed3dExtensions() {
  return ["3mf", "stl", "obj", "step", "stp", "iges", "igs", "ply", "amf"];
}

export function getFileExtension(filename) {
  const extension = path.extname(filename || "").toLowerCase();
  return extension.startsWith(".") ? extension.slice(1) : extension;
}

export function canExtractFilamentFromFile(file) {
  return getFileExtension(file?.originalFilename) === "3mf";
}

export function isSliceableModelFile(file) {
  return getAllowed3dExtensions().includes(getFileExtension(file?.originalFilename)) &&
    getFileExtension(file?.originalFilename) !== "gcode";
}

export function getEffectiveFilamentLabel(file) {
  if (Array.isArray(file?.extractedFilamentBreakdown) && file.extractedFilamentBreakdown.length > 1) {
    return "Multiple filaments";
  }

  return file?.extractedFilamentType || file?.filamentSelection || "Not selected";
}

export function getPrintEligibility(file) {
  if (!file?.filamentSelection) {
    return {
      canPrint: false,
      reason: "Select a filament before printing.",
    };
  }

  if (isExtractFilamentSelection(file?.filamentSelection) && !canExtractFilamentFromFile(file)) {
    return {
      canPrint: false,
      reason: "Extract from file is only supported for Orca project 3MF uploads.",
    };
  }

  if (file?.extractionStatus === "failed") {
    return {
      canPrint: false,
      reason: file?.extractionError || "Backend processing failed for this file.",
    };
  }

  if (file?.extractionStatus !== "verified" || !file?.extractedFilamentType) {
    return {
      canPrint: false,
      reason: "Backend slicing has not completed yet.",
    };
  }

  if (file?.sliceStatus === "failed") {
    return {
      canPrint: false,
      reason: file?.sliceError || "Automatic slicing failed for this file.",
    };
  }

  if (isSliceableModelFile(file) && (file?.sliceStatus !== "sliced" || !file?.slicedObjectKey)) {
    return {
      canPrint: false,
      reason: "Automatic slicing has not completed yet.",
    };
  }

  return {
    canPrint: true,
    reason: null,
  };
}
