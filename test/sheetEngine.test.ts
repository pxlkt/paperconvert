import { describe, expect, test } from "bun:test";
import * as XLSX from "xlsx";
import { convertSheet } from "../src/lib/sheetEngine";

const file = (name: string, data: BlobPart) => new File([data], name);

describe("spreadsheet engine", () => {
  test("CSV to JSON keeps every column, even empty ones", async () => {
    const { blob, warnings } = await convertSheet(file("a.csv", "name,age,city\nAda,36,\nAlan,41,London\n"), "csv", "json");
    expect(JSON.parse(await blob.text())).toEqual([
      { name: "Ada", age: 36, city: "" },
      { name: "Alan", age: 41, city: "London" },
    ]);
    expect(warnings).toEqual([]);
  });

  test("JSON to CSV quotes values that need it and keeps nested data as JSON", async () => {
    const { blob } = await convertSheet(file("a.json", JSON.stringify([{ a: "x,y", b: { c: 1 } }])), "json", "csv");
    expect((await blob.text()).trim()).toBe('a,b\n"x,y","{""c"":1}"');
  });

  test("JSON that is not a table is refused with a reason", async () => {
    await expect(convertSheet(file("a.json", "[1,2]"), "json", "csv")).rejects.toThrow("array of objects");
    await expect(convertSheet(file("a.json", "{nope"), "json", "csv")).rejects.toThrow("not valid JSON");
  });

  test("TSV is read and written with tabs", async () => {
    const { blob } = await convertSheet(file("a.tsv", "a\tb\n1\t2\n"), "tsv", "csv");
    expect((await blob.text()).trim()).toBe("a,b\n1,2");
  });

  test("a multi-sheet workbook to CSV says which sheet it took", async () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["first"]]), "One");
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["second"]]), "Two");
    const bytes = XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const { blob, warnings } = await convertSheet(file("b.xlsx", bytes), "xlsx", "csv");
    expect((await blob.text()).trim()).toBe("first");
    expect(warnings[0]).toContain("“One”");
    // workbook formats keep every sheet
    const ods = await convertSheet(file("b.xlsx", bytes), "xlsx", "ods");
    expect(XLSX.read(new Uint8Array(await ods.blob.arrayBuffer())).SheetNames).toEqual(["One", "Two"]);
    expect(ods.warnings).toEqual([]);
  });

  test("XLS output is a real BIFF8 workbook", async () => {
    const { blob } = await convertSheet(file("a.csv", "a,b\n1,2\n"), "csv", "xls");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    // OLE compound document signature
    expect([...bytes.slice(0, 4)]).toEqual([0xd0, 0xcf, 0x11, 0xe0]);
    expect(XLSX.utils.sheet_to_csv(XLSX.read(bytes).Sheets.Sheet1!).trim()).toBe("a,b\n1,2");
  });

  test("HTML output escapes sheet names", async () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["x"]]), "<b>");
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["y"]]), "ok");
    const bytes = XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const html = await (await convertSheet(file("c.xlsx", bytes), "xlsx", "html")).blob.text();
    expect(html).toContain("<h2>&lt;b&gt;</h2>");
    expect(html).not.toContain("<h2><b>");
  });
});
