import * as XLSX from "xlsx";
import {
  parseRegisterRows,
  parseRegisterWorkbook,
} from "@/lib/admin/register-file";

function buildWorkbookBuffer(rows: Array<Record<string, unknown>>): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  return XLSX.write(workbook, { bookType: "xlsx", type: "array" });
}

describe("parseRegisterWorkbook", () => {
  it("parses quantity-aware register rows and deduplicates SKUs", () => {
    const buffer = buildWorkbookBuffer([
      {
        SKU_NO: "0001",
        DESCRIPTION1: "Alpha",
        DESCRIPTION2: " Product",
        LIST_PRICE: 12.5,
        QUANTITY_ON_HAND: 3,
        DATE_SOLD: "2026-03-01 00:00:00",
      },
      {
        SKU_NO: "0001",
        DESCRIPTION1: "Alpha Duplicate",
        LIST_PRICE: 50,
        QUANTITY_ON_HAND: 99,
      },
      {
        SKU_NO: "0002",
        NAME: "Beta Product",
        PRICE: "4.95",
        QUANTITY: "0",
        DATE_RECVD: "2026-02-10 00:00:00",
      },
      {
        DESCRIPTION1: "Missing SKU",
        LIST_PRICE: 1,
      },
    ]);

    const products = parseRegisterWorkbook(buffer);

    expect(products).toEqual([
      {
        sku: "0001",
        name: "Alpha Product",
        price: 12.5,
        quantityOnHand: 3,
        dateCreated: null,
        dateCounted: null,
        dateReceived: null,
        datePriced: null,
        dateSold: "2026-03-01 00:00:00",
      },
      {
        sku: "0002",
        name: "Beta Product",
        price: 4.95,
        quantityOnHand: 0,
        dateCreated: null,
        dateCounted: null,
        dateReceived: "2026-02-10 00:00:00",
        datePriced: null,
        dateSold: null,
      },
    ]);
  });

  it("normalizes raw ODBC rows with string values", () => {
    const products = parseRegisterRows([
      {
        SKU_NO: " 013227536917",
        DESCRIPTION1: "DOG COLLAR LEAF PRIN",
        DESCRIPTION2: " T LARGE",
        LIST_PRICE: "114.99",
        QUANTITY_ON_HAND: "0",
        DATE_PRICED: "2026-03-20 00:00:00",
      },
      {
        SKU_NO: "013227536917",
        DESCRIPTION1: "Duplicate",
        LIST_PRICE: "999.99",
      },
    ]);

    expect(products).toEqual([
      {
        sku: "013227536917",
        name: "DOG COLLAR LEAF PRIN T LARGE",
        price: 114.99,
        quantityOnHand: 0,
        dateCreated: null,
        dateCounted: null,
        dateReceived: null,
        datePriced: "2026-03-20 00:00:00",
        dateSold: null,
      },
    ]);
  });
});
