/**
 * @jest-environment jsdom
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PipelineClient } from "@/components/admin/pipeline/PipelineClient";
import type { PipelineProduct, StatusCount } from "@/lib/pipeline/types";

const products: PipelineProduct[] = [
  {
    sku: "SKU001",
    input: { name: "Product 1", price: 10.0 },
    sources: {},
    consolidated: { name: "Product 1", price: 10.0 },
    pipeline_status: "imported",
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  },
  {
    sku: "SKU002",
    input: { name: "Product 2", price: 20.0 },
    sources: {},
    consolidated: { name: "Product 2", price: 20.0 },
    pipeline_status: "imported",
    created_at: "2026-01-02",
    updated_at: "2026-01-02",
  },
  {
    sku: "SKU003",
    input: { name: "Product 3", price: 30.0 },
    sources: {},
    consolidated: { name: "Product 3", price: 30.0 },
    pipeline_status: "imported",
    created_at: "2026-01-03",
    updated_at: "2026-01-03",
  },
];

const counts: StatusCount[] = [
  { status: "imported", count: 3 },
  { status: "scraped", count: 0 },
  { status: "consolidated", count: 0 },
  { status: "finalized", count: 0 },
  { status: "published", count: 0 },
];

beforeAll(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ products, count: 3, counts }),
  });
});

afterAll(() => {
  // @ts-expect-error global fetch assignment
  global.fetch = undefined;
});

describe("PipelineClient shift range selection", () => {
  it("selects a range with Shift+Click in table mode", async () => {
    render(
      <PipelineClient
        initialCounts={counts}
        initialProducts={products}
        initialTotal={3}
      />,
    );

    const checkbox1 = await screen.findByLabelText("Select SKU001");
    fireEvent.click(checkbox1);

    const row3 = screen.getByText("SKU003").closest("tr");
    expect(row3).toBeTruthy();

    fireEvent.click(row3!, { shiftKey: true });

    await waitFor(() => {
      expect(screen.getByLabelText("Select SKU001")).toBeChecked();
      expect(screen.getByLabelText("Select SKU002")).toBeChecked();
      expect(screen.getByLabelText("Select SKU003")).toBeChecked();
    });
  });
});
