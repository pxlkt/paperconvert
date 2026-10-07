// ─── Spreadsheet engine ─────────────────────────────────────────────────────
// SheetJS reads XLSX, XLS, ODS, CSV and TSV; JSON comes in as an array of row
// objects. Workbook outputs keep every sheet. Single-table outputs (CSV, TSV,
// JSON) take the first sheet and say so when others were left behind.

import * as XLSX from "xlsx";
import { ConversionError } from "./errors";
import { LIMITS } from "./options";
import { formatBytes } from "./bytes";
import { escapeHtml, htmlDocument } from "./textEngine";
import { mimeFor } from "./formats";

export function jsonToWorkbook(text: string): XLSX.WorkBook {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new ConversionError(`This is not valid JSON (${err instanceof Error ? err.message : String(err)}).`);
  }
  const rows = Array.isArray(data) ? data : [data];
  if (!rows.every((r) => r !== null && typeof r === "object" && !Array.isArray(r))) {
    throw new ConversionError("JSON converts to a table when it is an array of objects, like [{\"name\": \"Ada\", \"age\": 36}].");
  }
  // nested values become their JSON text rather than "[object Object]"
  const flat = (rows as Record<string, unknown>[]).map((r) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v !== null && typeof v === "object" ? JSON.stringify(v) : v])),
  );
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(flat), "Sheet1");
  return book;
}

async function readWorkbook(file: File, from: string): Promise<XLSX.WorkBook> {
  if (from === "json") return jsonToWorkbook(await file.text());
  if (from === "csv" || from === "tsv") {
    return XLSX.read(await file.text(), { type: "string", ...(from === "tsv" ? { FS: "\t" } : {}) });
  }
  try {
    return XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
  } catch (err) {
    throw new ConversionError(`This workbook could not be read (${err instanceof Error ? err.message : String(err)}).`);
  }
}

export interface SheetResult {
  blob: Blob;
  warnings: string[];
}

export async function convertSheet(file: File, from: string, to: string): Promise<SheetResult> {
  if (file.size > LIMITS.maxSheetBytes) {
    throw new ConversionError(`This file is ${formatBytes(file.size)}. PaperConvert reads spreadsheets up to ${formatBytes(LIMITS.maxSheetBytes)}.`);
  }
  const book = await readWorkbook(file, from);
  const firstName = book.SheetNames[0];
  if (!firstName) throw new ConversionError("This workbook has no sheets.");
  const first = book.Sheets[firstName]!;
  const warnings: string[] = [];
  const singleTable = () => {
    if (book.SheetNames.length > 1) {
      warnings.push(`${to.toUpperCase()} holds one table, so only the first sheet, “${firstName}”, was converted (${book.SheetNames.length - 1} more left out).`);
    }
  };
  const text = (s: string) => ({ blob: new Blob([s], { type: `${mimeFor(to)};charset=utf-8` }), warnings });

  switch (to) {
    case "csv":
      singleTable();
      return text(XLSX.utils.sheet_to_csv(first));
    case "tsv":
      singleTable();
      return text(XLSX.utils.sheet_to_csv(first, { FS: "\t" }));
    case "json":
      singleTable();
      return text(JSON.stringify(XLSX.utils.sheet_to_json(first, { defval: "" }), null, 2));
    case "html": {
      const body = book.SheetNames.map((name) => {
        const table = XLSX.utils.sheet_to_html(book.Sheets[name]!, { header: "", footer: "" });
        return `${book.SheetNames.length > 1 ? `<h2>${escapeHtml(name)}</h2>\n` : ""}${table}`;
      }).join("\n");
      return text(htmlDocument(file.name.replace(/\.[^.]+$/, ""), body));
    }
    case "xlsx":
    case "xls":
    case "ods": {
      const bookType = to === "xls" ? "biff8" : to;
      const out = XLSX.write(book, { type: "array", bookType }) as ArrayBuffer;
      return { blob: new Blob([out], { type: mimeFor(to) }), warnings };
    }
    default:
      throw new ConversionError(`The spreadsheet engine cannot write ${to}.`);
  }
}
