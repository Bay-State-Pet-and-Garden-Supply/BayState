import * as XLSX from "xlsx";

export interface RegisterWorkbookProduct {
  sku: string;
  name: string;
  price: number;
  quantityOnHand: number;
  dateCreated: string | null;
  dateCounted: string | null;
  dateReceived: string | null;
  datePriced: string | null;
  dateSold: string | null;
}

function parseNumericCell(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value !== "string") {
    return 0;
  }

  const normalized = value.trim().replace(/,/g, "");
  if (!normalized) {
    return 0;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDateCell(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.toISOString();
  }

  const normalized = String(value).trim();
  return normalized || null;
}

function buildProductName(row: Record<string, unknown>): string {
  const descriptionOne = String(row["DESCRIPTION1"] || row["NAME"] || "").trim();
  const descriptionTwo = String(row["DESCRIPTION2"] || "").trim();

  return [descriptionOne, descriptionTwo].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

export function parseRegisterRows(
  rows: Array<Record<string, unknown>>,
): RegisterWorkbookProduct[] {
  const products = rows
    .map((row) => {
      const sku = String(row["SKU_NO"] || row["SKU"] || "").trim();
      const name = buildProductName(row);

      return {
        sku,
        name,
        price: parseNumericCell(row["LIST_PRICE"] ?? row["PRICE"] ?? 0),
        quantityOnHand: Math.trunc(
          parseNumericCell(
            row["QUANTITY_ON_HAND"] ?? row["QUANTITY"] ?? row["QOH"] ?? 0,
          ),
        ),
        dateCreated: parseDateCell(row["DATE_CREATED"]),
        dateCounted: parseDateCell(row["DATE_COUNTED"]),
        dateReceived: parseDateCell(row["DATE_RECVD"]),
        datePriced: parseDateCell(row["DATE_PRICED"]),
        dateSold: parseDateCell(row["DATE_SOLD"]),
      };
    })
    .filter((product) => product.sku && product.name);

  const uniqueProducts = new Map<string, RegisterWorkbookProduct>();
  for (const product of products) {
    if (!uniqueProducts.has(product.sku)) {
      uniqueProducts.set(product.sku, product);
    }
  }

  return Array.from(uniqueProducts.values());
}

export function parseRegisterWorkbook(buffer: ArrayBuffer): RegisterWorkbookProduct[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);

  return parseRegisterRows(rows);
}
