import {
  normalizeRegisterSyncFields,
  planRegisterSync,
} from "@/lib/admin/register-sync";

describe("register sync planning", () => {
  it("normalizes inventory aliases into quantity and stock status updates", () => {
    expect(normalizeRegisterSyncFields("inventory, price")).toEqual([
      "quantity",
      "stock_status",
      "price",
    ]);
  });

  it("plans inventory updates, preserves pre-orders, and reports missing SKUs", () => {
    const plan = planRegisterSync(
      [
        {
          sku: "SKU-1",
          name: "Updated Product",
          price: 14.99,
          quantityOnHand: 0,
          dateCreated: null,
          dateCounted: null,
          dateReceived: null,
          datePriced: null,
          dateSold: null,
        },
        {
          sku: "SKU-2",
          name: "Pre-order Product",
          price: 5,
          quantityOnHand: 0,
          dateCreated: null,
          dateCounted: null,
          dateReceived: null,
          datePriced: null,
          dateSold: null,
        },
        {
          sku: "SKU-3",
          name: "Missing Product",
          price: 8.5,
          quantityOnHand: 4,
          dateCreated: null,
          dateCounted: null,
          dateReceived: null,
          datePriced: null,
          dateSold: null,
        },
      ],
      [
        {
          id: "1",
          sku: "SKU-1",
          name: "Updated Product",
          slug: "updated-product",
          price: 14.99,
          quantity: 5,
          stock_status: "in_stock",
        },
        {
          id: "2",
          sku: "SKU-2",
          name: "Pre-order Product",
          slug: "pre-order-product",
          price: 5,
          quantity: 0,
          stock_status: "pre_order",
        },
      ],
      "inventory",
      "2026-04-04T17:04:30.771Z",
    );

    expect(plan.fields).toEqual(["quantity", "stock_status"]);
    expect(plan.totalInFile).toBe(3);
    expect(plan.matchedProducts).toBe(2);
    expect(plan.unchangedProducts).toBe(1);
    expect(plan.missingProducts).toHaveLength(1);
    expect(plan.missingProducts[0].sku).toBe("SKU-3");
    expect(plan.updates).toEqual([
      {
        id: "1",
        sku: "SKU-1",
        name: "Updated Product",
        slug: "updated-product",
        price: 14.99,
        quantity: 0,
        stock_status: "out_of_stock",
        updated_at: "2026-04-04T17:04:30.771Z",
      },
    ]);
    expect(plan.previews).toEqual([
      {
        sku: "SKU-1",
        name: "Updated Product",
        changes: [
          {
            field: "quantity",
            before: 5,
            after: 0,
          },
          {
            field: "stock_status",
            before: "in_stock",
            after: "out_of_stock",
          },
        ],
      },
    ]);
  });

  it("can plan price-only updates without changing inventory", () => {
    const plan = planRegisterSync(
      [
        {
          sku: "SKU-4",
          name: "Price Change",
          price: 19.49,
          quantityOnHand: 8,
          dateCreated: null,
          dateCounted: null,
          dateReceived: null,
          datePriced: null,
          dateSold: null,
        },
      ],
      [
        {
          id: "4",
          sku: "SKU-4",
          name: "Price Change",
          slug: "price-change",
          price: 17,
          quantity: 3,
          stock_status: "in_stock",
        },
      ],
      "price",
      "2026-04-04T17:04:30.771Z",
    );

    expect(plan.fields).toEqual(["price"]);
    expect(plan.updates).toEqual([
      {
        id: "4",
        sku: "SKU-4",
        name: "Price Change",
        slug: "price-change",
        price: 19.49,
        quantity: 3,
        stock_status: "in_stock",
        updated_at: "2026-04-04T17:04:30.771Z",
      },
    ]);
  });
});
