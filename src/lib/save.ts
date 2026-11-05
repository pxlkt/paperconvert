/** Saves a converted file. PaperButton has no download prop, so the save goes through a throwaway anchor. */
export function saveFile(url: string, fileName: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
}
