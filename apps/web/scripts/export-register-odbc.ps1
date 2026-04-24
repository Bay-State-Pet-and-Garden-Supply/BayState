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

function Export-Table-To-Json {
    param(
        [Parameter(Mandatory = $true)]
        [System.Data.Odbc.OdbcConnection]$Connection,
        [Parameter(Mandatory = $true)]
        [string]$Query,
        [Parameter(Mandatory = $true)]
        [string]$FilePath
    )

    $cmd = $Connection.CreateCommand()
    $cmd.CommandText = $Query
    
    $commandTimeout = Get-EnvValue 'REGISTER_ODBC_COMMAND_TIMEOUT_SECONDS'
    if ($commandTimeout) {
        $cmd.CommandTimeout = [int]$commandTimeout
    }

    $rdr = $cmd.ExecuteReader()
    $stm = [System.IO.File]::Create($FilePath)
    $writer = [System.Text.Json.Utf8JsonWriter]::new($stm)
    $writer.WriteStartArray()

    while ($rdr.Read()) {
        $writer.WriteStartObject()
        for ($index = 0; $index -lt $rdr.FieldCount; $index += 1) {
            $columnName = $rdr.GetName($index)
            if ($rdr.IsDBNull($index)) {
                $writer.WriteNull($columnName)
                continue
            }
            $value = $rdr.GetValue($index)
            switch ($value.GetType().FullName) {
                'System.Boolean' { $writer.WriteBoolean($columnName, [bool]$value) }
                'System.Byte'    { $writer.WriteNumber($columnName, [byte]$value) }
                'System.Int16'   { $writer.WriteNumber($columnName, [int16]$value) }
                'System.Int32'   { $writer.WriteNumber($columnName, [int]$value) }
                'System.Int64'   { $writer.WriteNumber($columnName, [long]$value) }
                'System.Single'  { $writer.WriteNumber($columnName, [single]$value) }
                'System.Double'  { $writer.WriteNumber($columnName, [double]$value) }
                'System.Decimal' { $writer.WriteNumber($columnName, [decimal]$value) }
                default          { $writer.WriteString($columnName, [string]$value) }
            }
        }
        $writer.WriteEndObject()
    }

    $writer.WriteEndArray()
    $writer.Flush()
    $writer.Dispose()
    $stm.Dispose()
    $rdr.Dispose()
    $cmd.Dispose()
}

$selectClause = 'SELECT'
if ($RowLimit -gt 0) {
    $selectClause = "SELECT TOP $RowLimit"
}

$inventoryQuery = @"
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

$salesQuery = @"
$selectClause
    POS_SALES_HEADER.TRAN_DATE,
    POS_SALES_HEADER.TRAN_TIME,
    POS_SALES_HEADER.SALE_TOTAL,
    POS_SALES_HEADER.SALE_TAX,
    POS_SALES_HEADER.SALE_COST,
    POS_SALES_HEADER.INVOICE_NO,
    POS_SALES_HEADER.CASHIER,
    POS_SALES_HEADER.REGISTER
FROM none.POS_SALES_HEADER POS_SALES_HEADER
"@

$connection = $null
try {
    $outputDir = if ([System.IO.Directory]::Exists($OutputPath)) { $OutputPath } else { Split-Path -Path $OutputPath -Parent }
    if (-not [string]::IsNullOrWhiteSpace($outputDir) -and -not [System.IO.Directory]::Exists($outputDir)) {
        [System.IO.Directory]::CreateDirectory($outputDir) | Out-Null
    }

    $connection = [System.Data.Odbc.OdbcConnection]::new((Get-RegisterConnectionString))
    $connection.Open()

    # If OutputPath is a directory, use fixed filenames. If it's a file path, use it for inventory and derive sales.
    $inventoryPath = $OutputPath
    $salesPath = $null
    
    if ([System.IO.Directory]::Exists($OutputPath)) {
        $inventoryPath = [System.IO.Path]::Combine($OutputPath, "register-inventory.json")
        $salesPath = [System.IO.Path]::Combine($OutputPath, "register-sales.json")
    } else {
        $salesPath = [System.IO.Path]::Combine((Split-Path -Path $OutputPath -Parent), "register-sales.json")
    }

    Write-Host "Exporting inventory to $inventoryPath..."
    Export-Table-To-Json -Connection $connection -Query $inventoryQuery -FilePath $inventoryPath
    
    Write-Host "Exporting sales to $salesPath..."
    Export-Table-To-Json -Connection $connection -Query $salesQuery -FilePath $salesPath

    Write-Host "Export complete."
}
finally {
    if ($connection) {
        $connection.Dispose()
    }
}
