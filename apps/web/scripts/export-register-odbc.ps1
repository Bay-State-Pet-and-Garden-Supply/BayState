param(
    [Parameter(Mandatory = $true)]
    [string]$OutputPath,

    [int]$RowLimit = 0
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-EnvValue {
    param([string]$Name)

    $value = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($value)) {
        return $null
    }

    return $value.Trim()
}

function Get-RegisterConnectionString {
    $explicitConnectionString = Get-EnvValue 'REGISTER_ODBC_CONNECTION_STRING'
    if ($explicitConnectionString) {
        return $explicitConnectionString
    }

    $dsn = Get-EnvValue 'REGISTER_ODBC_DSN'
    if ($dsn) {
        $parts = @("DSN=$dsn")

        $userId = Get-EnvValue 'REGISTER_ODBC_UID'
        if ($userId) {
            $parts += "UID=$userId"
        }

        $password = Get-EnvValue 'REGISTER_ODBC_PWD'
        if ($password) {
            $parts += "PWD=$password"
        }

        $timeout = Get-EnvValue 'REGISTER_ODBC_TIMEOUT_SECONDS'
        if ($timeout) {
            $parts += "Timeout=$timeout"
        }

        return ($parts -join ';') + ';'
    }

    $driver = Get-EnvValue 'REGISTER_ODBC_DRIVER'
    $server = Get-EnvValue 'REGISTER_ODBC_SERVER'
    if ($driver -and $server) {
        $parts = @(
            "Driver={$driver}"
            "Server=$server"
        )

        foreach ($name in @(
            'REGISTER_ODBC_PORT',
            'REGISTER_ODBC_SSL_PORT',
            'REGISTER_ODBC_TIMEOUT_SECONDS',
            'REGISTER_ODBC_UID',
            'REGISTER_ODBC_PWD'
        )) {
            $value = Get-EnvValue $name
            if (-not $value) {
                continue
            }

            switch ($name) {
                'REGISTER_ODBC_PORT' { $parts += "Port=$value" }
                'REGISTER_ODBC_SSL_PORT' { $parts += "SSLPort=$value" }
                'REGISTER_ODBC_TIMEOUT_SECONDS' { $parts += "Timeout=$value" }
                'REGISTER_ODBC_UID' { $parts += "UID=$value" }
                'REGISTER_ODBC_PWD' { $parts += "PWD=$value" }
            }
        }

        return ($parts -join ';') + ';'
    }

    throw 'Missing register ODBC configuration. Set REGISTER_ODBC_CONNECTION_STRING (preferred), REGISTER_ODBC_DSN, or REGISTER_ODBC_DRIVER plus REGISTER_ODBC_SERVER.'
}

$selectClause = 'SELECT'
if ($RowLimit -gt 0) {
    $selectClause = "SELECT TOP $RowLimit"
}

$query = @"
$selectClause
    POS_INVENTORY.SKU_NO,
    POS_INVENTORY.DESCRIPTION1,
    POS_INVENTORY.DESCRIPTION2,
    POS_INVENTORY.LIST_PRICE,
    POS_INVENTORY.QUANTITY_ON_HAND,
    POS_INVENTORY.DATE_CREATED,
    POS_INVENTORY.DATE_COUNTED,
    POS_INVENTORY.DATE_RECVD,
    POS_INVENTORY.DATE_PRICED,
    POS_INVENTORY.DATE_SOLD
FROM none.POS_INVENTORY POS_INVENTORY
"@

$connection = $null
$command = $null
$reader = $null
$stream = $null
$jsonWriter = $null

try {
    $parentDirectory = Split-Path -Path $OutputPath -Parent
    if (-not [string]::IsNullOrWhiteSpace($parentDirectory)) {
        [System.IO.Directory]::CreateDirectory($parentDirectory) | Out-Null
    }

    $connection = [System.Data.Odbc.OdbcConnection]::new((Get-RegisterConnectionString))
    $command = $connection.CreateCommand()
    $command.CommandText = $query

    $commandTimeout = Get-EnvValue 'REGISTER_ODBC_COMMAND_TIMEOUT_SECONDS'
    if ($commandTimeout) {
        $command.CommandTimeout = [int]$commandTimeout
    }

    $connection.Open()
    $reader = $command.ExecuteReader()

    $stream = [System.IO.File]::Create($OutputPath)
    $jsonWriter = [System.Text.Json.Utf8JsonWriter]::new($stream)
    $jsonWriter.WriteStartArray()

    while ($reader.Read()) {
        $jsonWriter.WriteStartObject()

        for ($index = 0; $index -lt $reader.FieldCount; $index += 1) {
            $columnName = $reader.GetName($index)

            if ($reader.IsDBNull($index)) {
                $jsonWriter.WriteNull($columnName)
                continue
            }

            $value = $reader.GetValue($index)
            switch ($value.GetType().FullName) {
                'System.Boolean' {
                    $jsonWriter.WriteBoolean($columnName, [bool]$value)
                }
                'System.Byte' {
                    $jsonWriter.WriteNumber($columnName, [byte]$value)
                }
                'System.Int16' {
                    $jsonWriter.WriteNumber($columnName, [int16]$value)
                }
                'System.Int32' {
                    $jsonWriter.WriteNumber($columnName, [int]$value)
                }
                'System.Int64' {
                    $jsonWriter.WriteNumber($columnName, [long]$value)
                }
                'System.Single' {
                    $jsonWriter.WriteNumber($columnName, [single]$value)
                }
                'System.Double' {
                    $jsonWriter.WriteNumber($columnName, [double]$value)
                }
                'System.Decimal' {
                    $jsonWriter.WriteNumber($columnName, [decimal]$value)
                }
                default {
                    $jsonWriter.WriteString($columnName, [string]$value)
                }
            }
        }

        $jsonWriter.WriteEndObject()
    }

    $jsonWriter.WriteEndArray()
    $jsonWriter.Flush()
}
finally {
    if ($jsonWriter) {
        $jsonWriter.Dispose()
    }

    if ($stream) {
        $stream.Dispose()
    }

    if ($reader) {
        $reader.Dispose()
    }

    if ($command) {
        $command.Dispose()
    }

    if ($connection) {
        $connection.Dispose()
    }
}
