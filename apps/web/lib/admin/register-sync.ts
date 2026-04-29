import { RegisterWorkbookProduct } from "@/lib/admin/register-file";

type RegisterSyncField = "quantity" | "stock_status" | "price";

export interface RegisterSyncExistingProduct {
  id: string;
  sku: string;
  name: string;
  slug: string;
  price: number;
  quantity: number;
  stock_status: string;
  date_sold?: string | null;
  date_received?: string | null;
  date_counted?: string | null;
  date_created?: string | null;
  date_priced?: string | null;
}

interface RegisterSyncChange {
  field: RegisterSyncField | "date_sold" | "date_received" | "date_counted" | "date_created" | "date_priced";
  before: number | string | null;
  after: number | string | null;
}

interface RegisterSyncPreview {
  sku: string;
  name: string;
  changes: RegisterSyncChange[];
}

export interface RegisterSyncUpdate {
  id: string;
  sku: string;
  name: string;
  slug: string;
  price: number;
  quantity: number;
  stock_status: string;
  date_sold?: string | null;
  date_received?: string | null;
  date_counted?: string | null;
  date_created?: string | null;
  date_priced?: string | null;
  updated_at: string;
}

interface RegisterSyncPlan {
  totalInFile: number;
  matchedProducts: number;
  unchangedProducts: number;
  fields: RegisterSyncField[];
  missingProducts: RegisterWorkbookProduct[];
  updates: RegisterSyncUpdate[];
  previews: RegisterSyncPreview[];
}

const FIELD_ORDER: RegisterSyncField[] = ["quantity", "stock_status", "price"];

export const DEFAULT_REGISTER_SYNC_FIELDS: RegisterSyncField[] = [
  "quantity",
  "stock_status",
];

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function deriveInventoryStockStatus(
  quantityOnHand: number,
  currentStatus: string,
): string {
  if (quantityOnHand > 0) {
    return "in_stock";
  }

  return currentStatus === "pre_order" ? "pre_order" : "out_of_stock";
}

export function normalizeRegisterSyncFields(
  rawFields?: string | Iterable<string>,
): RegisterSyncField[] {
  if (!rawFields) {
    return [...DEFAULT_REGISTER_SYNC_FIELDS];
  }

  const requestedValues =
    typeof rawFields === "string" ? rawFields.split(",") : Array.from(rawFields);

  const normalizedFields = new Set<RegisterSyncField>();

  for (const requestedValue of requestedValues) {
    const normalizedValue = requestedValue.trim().toLowerCase();
    if (!normalizedValue) {
      continue;
    }

    if (
      normalizedValue === "inventory" ||
      normalizedValue === "stock" ||
      normalizedValue === "quantity" ||
      normalizedValue === "stock_status"
    ) {
      normalizedFields.add("quantity");
      normalizedFields.add("stock_status");
      continue;
    }

    if (normalizedValue === "price") {
      normalizedFields.add("price");
      continue;
    }

    throw new Error(
      `Unsupported register sync field: ${requestedValue}. Supported values are inventory, quantity, stock_status, and price.`,
    );
  }

  if (normalizedFields.size === 0) {
    return [...DEFAULT_REGISTER_SYNC_FIELDS];
  }

  return FIELD_ORDER.filter((field) => normalizedFields.has(field));
}

export function planRegisterSync(
  registerProducts: RegisterWorkbookProduct[],
  existingProducts: RegisterSyncExistingProduct[],
  rawFields?: string | Iterable<string>,
  updatedAt: string = new Date().toISOString(),
): RegisterSyncPlan {
  const fields = normalizeRegisterSyncFields(rawFields);
  const existingProductsBySku = new Map(
    existingProducts.map((product) => [product.sku, product]),
  );

  const updates: RegisterSyncUpdate[] = [];
  const previews: RegisterSyncPreview[] = [];
  const missingProducts: RegisterWorkbookProduct[] = [];
  let matchedProducts = 0;
  let unchangedProducts = 0;

  for (const registerProduct of registerProducts) {
    const existingProduct = existingProductsBySku.get(registerProduct.sku);

    if (!existingProduct) {
      missingProducts.push(registerProduct);
      continue;
    }

    matchedProducts += 1;

    const changes: RegisterSyncChange[] = [];
    let nextPrice = roundCurrency(existingProduct.price);
    let nextQuantity = existingProduct.quantity;
    let nextStockStatus = existingProduct.stock_status;

    if (fields.includes("quantity")) {
      if (existingProduct.quantity !== registerProduct.quantityOnHand) {
        changes.push({
          field: "quantity",
          before: existingProduct.quantity,
          after: registerProduct.quantityOnHand,
        });
        nextQuantity = registerProduct.quantityOnHand;
      }
    }

    if (fields.includes("stock_status")) {
      const targetStockStatus = deriveInventoryStockStatus(
        registerProduct.quantityOnHand,
        existingProduct.stock_status,
      );

      if (existingProduct.stock_status !== targetStockStatus) {
        changes.push({
          field: "stock_status",
          before: existingProduct.stock_status,
          after: targetStockStatus,
        });
        nextStockStatus = targetStockStatus;
      }
    }

    if (fields.includes("price")) {
      const targetPrice = roundCurrency(registerProduct.price);
      if (roundCurrency(existingProduct.price) !== targetPrice) {
        changes.push({
          field: "price",
          before: roundCurrency(existingProduct.price),
          after: targetPrice,
        });
        nextPrice = targetPrice;
      }
    }

    if (changes.length === 0) {
      // Also check if dates changed, even if core fields didn't
      const dateFields = ["date_sold", "date_received", "date_counted", "date_created", "date_priced"] as const;
      for (const dateField of dateFields) {
        const registerKey = dateField === "date_received" ? "dateReceived" : 
                           dateField === "date_sold" ? "dateSold" :
                           dateField === "date_counted" ? "dateCounted" :
                           dateField === "date_created" ? "dateCreated" : "datePriced";
        
        const existingValue = existingProduct[dateField] ? new Date(existingProduct[dateField]!).getTime() : null;
        const registerValue = registerProduct[registerKey] ? new Date(registerProduct[registerKey]!).getTime() : null;

        if (existingValue !== registerValue) {
          changes.push({
            field: dateField,
            before: existingProduct[dateField] || null,
            after: registerProduct[registerKey] || null,
          });
        }
      }
    }

    if (changes.length === 0) {
      unchangedProducts += 1;
      continue;
    }

    updates.push({
      id: existingProduct.id,
      sku: existingProduct.sku,
      name: existingProduct.name,
      slug: existingProduct.slug,
      price: nextPrice,
      quantity: nextQuantity,
      stock_status: nextStockStatus,
      date_sold: registerProduct.dateSold,
      date_received: registerProduct.dateReceived,
      date_counted: registerProduct.dateCounted,
      date_created: registerProduct.dateCreated,
      date_priced: registerProduct.datePriced,
      updated_at: updatedAt,
    });

    previews.push({
      sku: existingProduct.sku,
      name: existingProduct.name,
      changes,
    });
  }

  return {
    totalInFile: registerProducts.length,
    matchedProducts,
    unchangedProducts,
    fields,
    missingProducts,
    updates,
    previews,
  };
}
