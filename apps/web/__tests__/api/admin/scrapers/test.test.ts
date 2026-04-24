import { TextEncoder, TextDecoder } from "util";

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

if (typeof ReadableStream === "undefined") {
  // @ts-ignore
  const { ReadableStream } = require("stream/web");
  global.ReadableStream = ReadableStream;
}

jest.mock("next/server", () => {
  return {
    NextRequest: class {
      nextUrl: URL;
      private _body: string;
      constructor(url: string, init?: any) {
        this.nextUrl = new URL(url);
        this._body = init?.body ?? "";
      }
      async json() {
        return JSON.parse(this._body);
      }
    },
    NextResponse: class {
      body: any;
      headers: any;
      status: number;
      constructor(body: any, init: any) {
        this.body = body;
        this.headers = new Map(Object.entries(init?.headers || {}));
        this.status = init?.status || 200;
      }
      static json(body: any, init?: any) {
        return new (this as any)(body, {
          ...init,
          headers: { "Content-Type": "application/json" },
        });
      }
      async json() {
        return this.body;
      }
    },
  };
});

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

jest.mock("@/lib/admin/api-auth", () => ({
  requireAdminAuth: jest.fn(),
}));

// This import will FAIL because the POST endpoint doesn't exist yet (Task 8).
// That's intentional — these are RED tests.
const { POST } = require("@/app/api/admin/scrapers/test/route");
const { NextRequest } = require("next/server");
const { createClient } = require("@/lib/supabase/server");
const { requireAdminAuth } = require("@/lib/admin/api-auth");

describe("POST /api/admin/scrapers/test", () => {
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default: unauthorized
    (requireAdminAuth as jest.Mock).mockResolvedValue({
      authorized: false,
      response: { status: 403, body: { error: "Forbidden: Admin or staff access required" } },
    });

    mockSupabase = {
      from: jest.fn(),
      auth: {
        getUser: jest.fn(),
      },
    };
    (createClient as jest.Mock).mockResolvedValue(mockSupabase);
  });

  describe("auth", () => {
    it("should return 403 for non-admin users", async () => {
      (requireAdminAuth as jest.Mock).mockResolvedValue({
        authorized: false,
        response: { status: 403, body: { error: "Forbidden: Admin or staff access required" } },
      });

      const req = new NextRequest("http://localhost/api/admin/scrapers/test", {
        method: "POST",
        body: JSON.stringify({ scraper_id: "scraper-123", type: "test" }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
    });
  });

  describe("validation", () => {
    it("should return 400 if scraper_id is missing from request body", async () => {
      (requireAdminAuth as jest.Mock).mockResolvedValue({
        authorized: true,
        user: { id: "admin-user-id", email: "admin@example.com" },
        role: "admin",
      });

      const req = new NextRequest("http://localhost/api/admin/scrapers/test", {
        method: "POST",
        body: JSON.stringify({ type: "test" }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await POST(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBeDefined();
    });
  });

  describe("scraper lookup", () => {
    it("should return 404 if scraper not found", async () => {
      (requireAdminAuth as jest.Mock).mockResolvedValue({
        authorized: true,
        user: { id: "admin-user-id", email: "admin@example.com" },
        role: "admin",
      });

      const selectQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { message: "Not found", code: "PGRST116" },
        }),
      };
      mockSupabase.from.mockReturnValue(selectQuery);

      const req = new NextRequest("http://localhost/api/admin/scrapers/test", {
        method: "POST",
        body: JSON.stringify({ scraper_id: "nonexistent-scraper", type: "test" }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await POST(req);
      expect(res.status).toBe(404);
    });

    it("should return 400 if scraper has no test_assertions defined", async () => {
      (requireAdminAuth as jest.Mock).mockResolvedValue({
        authorized: true,
        user: { id: "admin-user-id", email: "admin@example.com" },
        role: "admin",
      });

      // Scraper exists but has no test_assertions
      const selectQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: "scraper-no-assertions",
            name: "Test Scraper",
            test_assertions: null,
          },
          error: null,
        }),
      };
      mockSupabase.from.mockReturnValue(selectQuery);

      const req = new NextRequest("http://localhost/api/admin/scrapers/test", {
        method: "POST",
        body: JSON.stringify({ scraper_id: "scraper-no-assertions", type: "test" }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await POST(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBeDefined();
    });
  });

  describe("successful test job creation", () => {
    it("should accept { scraper_id, type: 'test' } and return { job_id }", async () => {
      (requireAdminAuth as jest.Mock).mockResolvedValue({
        authorized: true,
        user: { id: "admin-user-id", email: "admin@example.com" },
        role: "admin",
      });

      // Scraper exists with test_assertions
      const selectQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: "scraper-with-assertions",
            name: "Good Scraper",
            test_assertions: [
              { sku: "SKU-001", expected: { name: "Test Product", price: "$9.99" } },
            ],
          },
          error: null,
        }),
      };
      mockSupabase.from.mockReturnValue(selectQuery);

      // Insert returns the new job
      const insertQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: "job-test-123",
            status: "pending",
            config_id: "scraper-with-assertions",
          },
          error: null,
        }),
      };
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "scraper_configs") return selectQuery;
        if (table === "scrape_jobs") return insertQuery;
        throw new Error(`Unexpected table: ${table}`);
      });

      const req = new NextRequest("http://localhost/api/admin/scrapers/test", {
        method: "POST",
        body: JSON.stringify({ scraper_id: "scraper-with-assertions", type: "test" }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.job_id).toBeDefined();
    });

    it("should accept { scraper_id, type: 'fake' } and return { job_id }", async () => {
      (requireAdminAuth as jest.Mock).mockResolvedValue({
        authorized: true,
        user: { id: "admin-user-id", email: "admin@example.com" },
        role: "admin",
      });

      const selectQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: "scraper-with-assertions",
            name: "Good Scraper",
            test_assertions: [
              { sku: "SKU-001", expected: { name: "Test Product", price: "$9.99" } },
            ],
          },
          error: null,
        }),
      };

      const insertQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: "job-fake-456",
            status: "pending",
            config_id: "scraper-with-assertions",
          },
          error: null,
        }),
      };
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "scraper_configs") return selectQuery;
        if (table === "scrape_jobs") return insertQuery;
        throw new Error(`Unexpected table: ${table}`);
      });

      const req = new NextRequest("http://localhost/api/admin/scrapers/test", {
        method: "POST",
        body: JSON.stringify({ scraper_id: "scraper-with-assertions", type: "fake" }),
        headers: { "Content-Type": "application/json" },
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.job_id).toBeDefined();
    });
  });
});