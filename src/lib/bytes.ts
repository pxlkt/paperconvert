export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/** Percentage saved going from `from` to `to` bytes; negative when the file grew. */
export function savingsPercent(from: number, to: number): number {
  if (!from) return 0;
  return Math.round(((from - to) / from) * 100);
}

export function baseName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return (dot > 0 ? fileName.slice(0, dot) : fileName) || "converted";
}

export function outputFileName(inputName: string, ext: string): string {
  return `${baseName(inputName)}.${ext}`;
}
