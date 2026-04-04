export type RegisterSyncSource = "odbc" | "workbook";

function hasValue(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

export function hasRegisterOdbcConfiguration(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    hasValue(env.REGISTER_ODBC_CONNECTION_STRING) ||
    hasValue(env.REGISTER_ODBC_DSN) ||
    (hasValue(env.REGISTER_ODBC_DRIVER) && hasValue(env.REGISTER_ODBC_SERVER))
  );
}

export function resolveRegisterSyncSource(
  rawSource?: string,
  env: NodeJS.ProcessEnv = process.env,
): RegisterSyncSource {
  const normalizedSource = rawSource?.trim().toLowerCase();

  if (!normalizedSource) {
    return hasRegisterOdbcConfiguration(env) ? "odbc" : "workbook";
  }

  if (normalizedSource === "odbc" || normalizedSource === "workbook") {
    return normalizedSource;
  }

  throw new Error(
    `Unsupported register sync source: ${rawSource}. Supported values are odbc and workbook.`,
  );
}
