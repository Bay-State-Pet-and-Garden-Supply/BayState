import {
  hasRegisterOdbcConfiguration,
  resolveRegisterSyncSource,
} from "@/lib/admin/register-source";

describe("register source resolution", () => {
  it("prefers ODBC when ODBC configuration is present", () => {
    expect(
      resolveRegisterSyncSource(undefined, {
        REGISTER_ODBC_CONNECTION_STRING: "Driver={Transoft};Server=10.9.8.1;",
        NODE_ENV: 'test',
      }),
    ).toBe("odbc");
  });

  it("falls back to workbook when no ODBC configuration exists", () => {
    expect(resolveRegisterSyncSource(undefined, { NODE_ENV: 'test' })).toBe("workbook");
    expect(hasRegisterOdbcConfiguration({ NODE_ENV: 'test' })).toBe(false);
  });

  it("accepts explicit workbook mode even when ODBC is configured", () => {
    expect(
      resolveRegisterSyncSource(
        "workbook",
        { REGISTER_ODBC_DSN: "integra.udd", NODE_ENV: 'test' },
      ),
    ).toBe("workbook");
  });

  it("rejects unsupported source values", () => {
    expect(() => resolveRegisterSyncSource("excel-refresh" as any, { NODE_ENV: 'test' })).toThrow(
      "Unsupported register sync source",
    );
  });
});
