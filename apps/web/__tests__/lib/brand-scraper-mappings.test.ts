/**
 * @jest-environment node
 */
import {
  getBrandScraperMappings,
  setBrandScraperMappings,
  getScraperRecommendationsWithMappings,
  type MappingInput,
} from "@/lib/admin/brand-scraper-mappings";
import { createClient } from "@/lib/supabase/server";

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

const mockCreateClient = createClient as jest.MockedFunction<
  typeof createClient
>;

describe("brand-scraper-mappings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getBrandScraperMappings", () => {
    it("returns correct shape with joined scraper config data", async () => {
      const mockData = [
        {
          id: "map-1",
          brand_id: "brand-1",
          scraper_config_id: "scraper-1",
          scraper_configs: { slug: "amazon", display_name: "Amazon Scraper" },
          priority: 10,
          is_active: true,
          notes: "Primary",
          created_by: "user-1",
          updated_by: "user-1",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ];

      const chain = {
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      };

      // First order call returns chain for chaining, second resolves the query
      chain.order
        .mockReturnValueOnce(chain)
        .mockResolvedValueOnce({ data: mockData, error: null });

      const selectMock = jest.fn().mockReturnValue(chain);

      const fromMock = jest.fn().mockReturnValue({
        select: selectMock,
      });

      mockCreateClient.mockResolvedValue({
        from: fromMock,
      } as never);

      const result = await getBrandScraperMappings("brand-1");

      expect(fromMock).toHaveBeenCalledWith("brand_scraper_mappings");
      expect(selectMock).toHaveBeenCalledWith(
        "*, scraper_configs!inner(slug, display_name)",
      );
      expect(chain.eq).toHaveBeenCalledWith("brand_id", "brand-1");
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: "map-1",
        brand_id: "brand-1",
        scraper_config_id: "scraper-1",
        scraper_slug: "amazon",
        scraper_name: "Amazon Scraper",
        priority: 10,
        is_active: true,
        notes: "Primary",
        created_by: "user-1",
        updated_by: "user-1",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      });
    });
  });

  describe("setBrandScraperMappings", () => {
    it("transactionally deletes existing and inserts new mappings", async () => {
      const deleteEqMock = jest.fn().mockResolvedValue({ error: null });
      const deleteMock = jest.fn().mockReturnValue({ eq: deleteEqMock });

      const insertMock = jest.fn().mockResolvedValue({ error: null });

      const fromMock = jest.fn().mockImplementation((table: string) => {
        if (table === "brand_scraper_mappings") {
          return {
            delete: deleteMock,
            insert: insertMock,
          };
        }
        return {};
      });

      mockCreateClient.mockResolvedValue({
        from: fromMock,
      } as never);

      const mappings: MappingInput[] = [
        {
          scraperConfigId: "scraper-1",
          priority: 10,
          notes: "Primary",
          isActive: true,
        },
      ];

      await setBrandScraperMappings("brand-1", mappings, "user-1");

      expect(fromMock).toHaveBeenCalledWith("brand_scraper_mappings");
      expect(deleteMock).toHaveBeenCalled();
      expect(deleteEqMock).toHaveBeenCalledWith("brand_id", "brand-1");
      expect(insertMock).toHaveBeenCalledWith([
        {
          brand_id: "brand-1",
          scraper_config_id: "scraper-1",
          priority: 10,
          is_active: true,
          notes: "Primary",
          created_by: "user-1",
          updated_by: "user-1",
        },
      ]);
    });

    it("throws on delete error", async () => {
      const deleteEqMock = jest.fn().mockResolvedValue({
        error: { message: "delete failed" },
      });
      const deleteMock = jest.fn().mockReturnValue({ eq: deleteEqMock });

      const fromMock = jest.fn().mockReturnValue({
        delete: deleteMock,
      });

      mockCreateClient.mockResolvedValue({
        from: fromMock,
      } as never);

      await expect(
        setBrandScraperMappings("brand-1", [], "user-1"),
      ).rejects.toThrow("Failed to clear existing mappings: delete failed");
    });

    it("skips insert when mappings array is empty", async () => {
      const deleteEqMock = jest.fn().mockResolvedValue({ error: null });
      const deleteMock = jest.fn().mockReturnValue({ eq: deleteEqMock });
      const insertMock = jest.fn().mockResolvedValue({ error: null });

      const fromMock = jest.fn().mockReturnValue({
        delete: deleteMock,
        insert: insertMock,
      });

      mockCreateClient.mockResolvedValue({
        from: fromMock,
      } as never);

      await setBrandScraperMappings("brand-1", [], "user-1");

      expect(insertMock).not.toHaveBeenCalled();
    });
  });

  describe("getScraperRecommendationsWithMappings", () => {
    function buildMockClient(scenarios: {
      explicit?: unknown[];
      affinity?: unknown[];
      scrapers?: unknown[];
    }) {
      let callCount = 0;
      const fromMock = jest.fn().mockImplementation((table: string) => {
        callCount++;
        if (table === "brand_scraper_mappings") {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest
                .fn()
                .mockResolvedValue({
                  data: scenarios.explicit ?? [],
                  error: null,
                }),
            }),
          };
        }
        if (table === "brand_scraper_affinity") {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest
                .fn()
                .mockResolvedValue({
                  data: scenarios.affinity ?? [],
                  error: null,
                }),
            }),
          };
        }
        if (table === "scraper_configs") {
          return {
            select: jest
              .fn()
              .mockResolvedValue({
                data: scenarios.scrapers ?? [],
                error: null,
              }),
          };
        }
        return {};
      });

      mockCreateClient.mockResolvedValue({
        from: fromMock,
      } as never);

      return { fromMock };
    }

    it("returns explicit active > affinity > untested", async () => {
      buildMockClient({
        explicit: [
          {
            id: "map-1",
            brand_id: "brand-1",
            scraper_config_id: "scraper-1",
            scraper_configs: { slug: "amazon", display_name: "Amazon" },
            priority: 10,
            is_active: true,
            notes: null,
            created_by: null,
            updated_by: null,
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
          },
        ],
        affinity: [
          {
            scraper_slug: "chewy",
            brand_name: "acme",
            hit_rate: 0.85,
            total_attempts: 20,
            successful_extractions: 17,
            avg_fields_extracted: 8,
            avg_images_found: 3,
          },
        ],
        scrapers: [
          { id: "scraper-1", slug: "amazon", display_name: "Amazon" },
          { id: "scraper-2", slug: "chewy", display_name: "Chewy" },
          { id: "scraper-3", slug: "petco", display_name: "Petco" },
        ],
      });

      const result = await getScraperRecommendationsWithMappings(
        "Acme",
        "brand-1",
      );

      expect(result).toHaveLength(3);
      expect(result[0]).toMatchObject({
        scraper_slug: "amazon",
        confidence: "mapped",
        preselected: true,
        is_explicit: true,
        is_active: true,
      });
      expect(result[1]).toMatchObject({
        scraper_slug: "chewy",
        confidence: "high",
        preselected: false,
        is_explicit: false,
      });
      expect(result[2]).toMatchObject({
        scraper_slug: "petco",
        confidence: "untested",
      });
    });

    it("blocks affinity with explicit inactive mappings", async () => {
      buildMockClient({
        explicit: [
          {
            id: "map-1",
            brand_id: "brand-1",
            scraper_config_id: "scraper-2",
            scraper_configs: { slug: "chewy", display_name: "Chewy" },
            priority: 5,
            is_active: false,
            notes: null,
            created_by: null,
            updated_by: null,
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
          },
        ],
        affinity: [
          {
            scraper_slug: "chewy",
            brand_name: "acme",
            hit_rate: 0.85,
            total_attempts: 20,
            successful_extractions: 17,
            avg_fields_extracted: 8,
            avg_images_found: 3,
          },
        ],
        scrapers: [
          { id: "scraper-2", slug: "chewy", display_name: "Chewy" },
          { id: "scraper-3", slug: "petco", display_name: "Petco" },
        ],
      });

      const result = await getScraperRecommendationsWithMappings(
        "Acme",
        "brand-1",
      );

      expect(result.find((r) => r.scraper_slug === "chewy")).toBeUndefined();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        scraper_slug: "petco",
        confidence: "untested",
      });
    });

    it("deduplicates so a scraper only appears once", async () => {
      buildMockClient({
        explicit: [
          {
            id: "map-1",
            brand_id: "brand-1",
            scraper_config_id: "scraper-1",
            scraper_configs: { slug: "amazon", display_name: "Amazon" },
            priority: 10,
            is_active: true,
            notes: null,
            created_by: null,
            updated_by: null,
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
          },
        ],
        affinity: [
          {
            scraper_slug: "amazon",
            brand_name: "acme",
            hit_rate: 0.5,
            total_attempts: 10,
            successful_extractions: 5,
            avg_fields_extracted: 5,
            avg_images_found: 2,
          },
        ],
        scrapers: [
          { id: "scraper-1", slug: "amazon", display_name: "Amazon" },
        ],
      });

      const result = await getScraperRecommendationsWithMappings(
        "Acme",
        "brand-1",
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        scraper_slug: "amazon",
        confidence: "mapped",
      });
    });

    it("fills untested when no brandId is provided", async () => {
      buildMockClient({
        explicit: [],
        affinity: [],
        scrapers: [
          { id: "scraper-1", slug: "amazon", display_name: "Amazon" },
        ],
      });

      const result = await getScraperRecommendationsWithMappings("Acme");

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        scraper_slug: "amazon",
        confidence: "untested",
        is_explicit: false,
        is_active: false,
      });
    });
  });
});
