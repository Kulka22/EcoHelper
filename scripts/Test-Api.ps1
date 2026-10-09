param(
    [string]$BaseUrl = 'http://localhost:5080',
    [string]$ReportPath = 'artifacts/api-smoke-results.json'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http
$client = New-Object System.Net.Http.HttpClient
$client.Timeout = [TimeSpan]::FromSeconds(15)
$results = New-Object 'System.Collections.Generic.List[object]'

function Get-Response {
    param([string]$Route, [hashtable]$Query = @{})
    $pairs = foreach ($entry in $Query.GetEnumerator()) {
        [Uri]::EscapeDataString($entry.Key) + '=' + [Uri]::EscapeDataString([string]$entry.Value)
    }
    $address = $BaseUrl.TrimEnd('/') + $Route
    if ($pairs) { $address += '?' + ($pairs -join '&') }
    $response = $client.GetAsync($address).GetAwaiter().GetResult()
    try {
        $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        $mediaType = $response.Content.Headers.ContentType.MediaType
        $json = if ($mediaType -like '*json') { ConvertFrom-Json -InputObject $body } else { $null }
        [pscustomobject]@{ Status = [int]$response.StatusCode; Body = $body; Json = $json; MediaType = $mediaType }
    }
    finally { $response.Dispose() }
}

function Assert {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}

function Test-Case {
    param([string]$Name, [scriptblock]$Test)
    try {
        & $Test
        $results.Add([pscustomobject]@{ name = $Name; passed = $true })
        Write-Output "PASS $Name"
    }
    catch {
        $results.Add([pscustomobject]@{ name = $Name; passed = $false; error = $_.Exception.Message })
        throw
    }
}

try {
    Test-Case 'Static index and stylesheet' {
        $page = Get-Response '/'
        Assert ($page.Status -eq 200 -and $page.Body.Contains('Экопомощник')) 'Index is not served.'
        $css = Get-Response '/css/site.css'
        Assert ($css.Status -eq 200 -and $css.MediaType -eq 'text/css') 'CSS is not served.'
    }

    Test-Case 'Category catalogue and aliases from SQLite' {
        $response = Get-Response '/api/recycling/categories'
        Assert ($response.Status -eq 200 -and @($response.Json).Count -eq 6) 'Expected six categories.'
        Assert (@($response.Json | Where-Object { $_.aliases -contains 'Стеклянная банка' }).Count -eq 1) 'Missing glass alias.'
        Assert (@($response.Json.code | Select-Object -Unique).Count -eq 6) 'Duplicate category codes.'
    }

    Test-Case 'All six categories have suitable demo points' {
        foreach ($code in @('glass', 'batteries', 'clothes', 'plastic_caps', 'paper', 'electronics')) {
            $response = Get-Response '/api/recycling/search' @{ item = $code; city = 'Москва' }
            Assert ($response.Status -eq 200 -and $response.Json.category.code -eq $code) "Category failed: $code"
            Assert (@($response.Json.points).Count -gt 0) "No points for $code"
            foreach ($point in $response.Json.points) {
                Assert ($point.acceptedCategories.code -contains $code) "Point does not accept $code"
            }
        }
    }

    Test-Case 'Russian case, whitespace, city and district prefixes' {
        $response = Get-Response '/api/recycling/search' @{ item = '  СТЕКЛЯННАЯ   БАНКА  '; city = ' г. МОСКВА '; district = ' район ДОРОГОМИЛОВО ' }
        Assert ($response.Status -eq 200 -and $response.Json.category.code -eq 'glass') 'Normalization failed.'
        Assert (@($response.Json.points).Count -eq 1) 'District filter failed.'
    }

    Test-Case 'Batteries do not return glass points or generic glass instructions' {
        $response = Get-Response '/api/recycling/search' @{ item = 'Батарейки'; city = 'Москва' }
        Assert (@($response.Json.points).Count -eq 1) 'Expected one battery point.'
        Assert ($response.Json.points[0].acceptedCategories.code -notcontains 'glass') 'Battery search returned a glass point.'
        Assert (($response.Json.preparationInstructions -join ' ').Contains('Не разбирайте')) 'Missing category-specific instructions.'
        Assert ($response.Json.isDemoData -eq $true) 'Demo marker missing.'
        Assert (-not ($response.Json.points[0].PSObject.Properties.Name -contains 'distance')) 'Unexpected fictional distance.'
    }

    Test-Case 'Unknown item returns a meaningful empty result' {
        $response = Get-Response '/api/recycling/search' @{ item = 'неизвестный предмет'; city = 'Москва' }
        Assert ($response.Status -eq 200 -and $null -eq $response.Json.category) 'Unknown item handling failed.'
        Assert (@($response.Json.points).Count -eq 0 -and $response.Json.message) 'Missing empty result.'
    }

    Test-Case 'Unknown city preserves preparation instructions' {
        $response = Get-Response '/api/recycling/search' @{ item = 'glass'; city = 'Казань' }
        Assert ($response.Status -eq 200 -and @($response.Json.points).Count -eq 0) 'City filter failed.'
        Assert (@($response.Json.preparationInstructions).Count -gt 0) 'Preparation instructions were lost.'
    }

    Test-Case 'Different district excludes unsuitable points' {
        $response = Get-Response '/api/recycling/search' @{ item = 'batteries'; city = 'Москва'; district = 'Дорогомилово' }
        Assert ($response.Status -eq 200 -and @($response.Json.points).Count -eq 0) 'District was ignored.'
    }

    Test-Case 'Blank optional district means entire city' {
        $response = Get-Response '/api/recycling/search' @{ item = 'electronics'; city = 'город Москва'; district = '  ' }
        Assert ($response.Status -eq 200 -and @($response.Json.points).Count -eq 2) 'Blank district handling failed.'
        Assert ($null -eq $response.Json.district) 'Blank district was not normalized to null.'
    }

    Test-Case 'Missing, blank and oversized recycling parameters produce HTTP 400' {
        foreach ($query in @(
            @{ city = 'Москва' }, @{ item = 'glass' }, @{ item = '  '; city = 'Москва' },
            @{ item = 'glass'; city = '  ' }, @{ item = ('x' * 121); city = 'Москва' },
            @{ item = 'glass'; city = 'Москва'; district = ('x' * 121) }
        )) {
            $response = Get-Response '/api/recycling/search' $query
            Assert ($response.Status -eq 400 -and $response.MediaType -eq 'application/problem+json') 'Expected validation problem.'
            Assert ($null -ne $response.Json.errors) 'Validation errors are missing.'
        }
    }

    Test-Case 'Input resembling SQL remains ordinary search text' {
        $response = Get-Response '/api/recycling/search' @{ item = "' OR 1=1 --"; city = 'Москва' }
        Assert ($response.Status -eq 200 -and @($response.Json.points).Count -eq 0) 'Unsafe search behavior.'
    }

    Test-Case 'Four violation types from SQLite' {
        $response = Get-Response '/api/violations/types'
        Assert ($response.Status -eq 200 -and @($response.Json).Count -eq 4) 'Expected four violation types.'
        Assert ($response.Json.code -contains 'waste_burning') 'Missing waste-burning type.'
    }

    Test-Case 'Every ready violation type returns general advice without LLM' {
        foreach ($code in @('illegal_dumping', 'waste_burning', 'water_pollution', 'illegal_logging')) {
            $response = Get-Response '/api/violations/recommendations' @{ type = $code }
            Assert ($response.Status -eq 200 -and $response.Json.type.code -eq $code) "Failed type: $code"
            Assert ($response.Json.isGeneralAdvice -eq $true -and $null -eq $response.Json.matchedCity) 'Expected general advice.'
            Assert (@($response.Json.recommendations).Count -gt 0 -and @($response.Json.whatToRecord).Count -gt 0) 'Advice is missing.'
            Assert (@($response.Json.organizations).Count -eq 1 -and $null -eq $response.Json.organizations[0].city) 'Unexpected local organization.'
        }
    }

    Test-Case 'Moscow location selects local and general organizations' {
        $response = Get-Response '/api/violations/recommendations' @{ type = 'waste_burning'; location = 'г. МОСКВА, район Арбат' }
        Assert ($response.Status -eq 200 -and $response.Json.matchedCity -eq 'Москва') 'City recognition failed.'
        Assert ($response.Json.isGeneralAdvice -eq $false -and @($response.Json.organizations).Count -eq 2) 'Local organization missing.'
        foreach ($organization in $response.Json.organizations) {
            Assert ($organization.website.StartsWith('https://')) 'Missing organization information link.'
        }
    }

    Test-Case 'Unsupported or incomplete location falls back to general advice' {
        foreach ($location in @('Казань, ул. Московская', 'Дорогомилово', 'Подмосковье', '  ')) {
            $response = Get-Response '/api/violations/recommendations' @{ type = 'illegal_dumping'; location = $location }
            Assert ($response.Status -eq 200 -and $response.Json.isGeneralAdvice -eq $true) "Unexpected location match: $location"
            Assert (@($response.Json.organizations).Count -eq 1 -and $null -eq $response.Json.organizations[0].city) 'Fictional local organization.'
        }
    }

    Test-Case 'Violation names support Cyrillic case and yo/e normalization' {
        $response = Get-Response '/api/violations/recommendations' @{ type = ' ЗАГРЯЗНЕНИЕ ВОДОЕМА ' }
        Assert ($response.Status -eq 200 -and $response.Json.type.code -eq 'water_pollution') 'Type name normalization failed.'
        $types = (Get-Response '/api/violations/types').Json
        $byId = Get-Response '/api/violations/recommendations' @{ type = [string]$types[0].id }
        Assert ($byId.Status -eq 200 -and $byId.Json.type.code -eq $types[0].code) 'Type ID lookup failed.'
    }

    Test-Case 'Unknown, missing and oversized violation parameters produce HTTP 400' {
        foreach ($query in @(
            @{}, @{ type = '  ' }, @{ type = 'unknown' }, @{ type = ('x' * 121) },
            @{ type = 'waste_burning'; location = ('x' * 301) },
            @{ type = 'Во дворе постоянно сжигают мусор. Что делать?' }
        )) {
            $response = Get-Response '/api/violations/recommendations' $query
            Assert ($response.Status -eq 400 -and $null -ne $response.Json.errors) 'Expected validation error, not fake classification.'
        }
    }

    Test-Case 'Database and design reference are not public static files' {
        foreach ($route in @('/App_Data/ecohelper.db', '/appsettings.json', '/design-reference/figma/index.html')) {
            Assert ((Get-Response $route).Status -eq 404) "Unexpected public file: $route"
        }
    }

    Test-Case 'AI endpoint has not been added at this stage' {
        Assert ((Get-Response '/api/chat').Status -eq 404) 'Unexpected AI endpoint.'
    }
}
finally {
    $client.Dispose()
    $reportDirectory = Split-Path -Parent $ReportPath
    if ($reportDirectory) { New-Item -ItemType Directory -Path $reportDirectory -Force | Out-Null }
    [pscustomobject]@{
        checkedAtUtc = [DateTime]::UtcNow.ToString('o')
        baseUrl = $BaseUrl
        passed = @($results | Where-Object passed).Count
        failed = @($results | Where-Object { -not $_.passed }).Count
        cases = $results.ToArray()
    } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $ReportPath -Encoding UTF8
}

Write-Output ("Passed {0} API checks." -f $results.Count)
