# Migrates plain Markdown docs (with leading "# Title") into Fumadocs-friendly
# files by adding YAML frontmatter (title, description) and stripping the H1.
# Also generates meta.json files for category ordering.
#
# Run from repo root:  pwsh -File scripts/migrate-to-fumadocs.ps1

$ErrorActionPreference = 'Stop'
$root = Resolve-Path "$PSScriptRoot\..\content\docs"

# Friendly names (and order) for top-level category folders
$categoryOrder = @(
  '01-relational-databases',
  '02-key-value-stores',
  '03-wide-column-stores',
  '04-document-stores',
  '06-search-and-indexing',
  '09-message-queues-and-streaming',
  '10-stream-processing',
  '11-batch-big-data',
  '12-data-warehousing',
  '14-workflow-orchestration-and-coordination'
)

$categoryTitles = @{
  '01-relational-databases'                    = 'Relational Databases'
  '02-key-value-stores'                        = 'Key-Value Stores'
  '03-wide-column-stores'                      = 'Wide-Column Stores'
  '04-document-stores'                         = 'Document Stores'
  '06-search-and-indexing'                     = 'Search & Indexing'
  '09-message-queues-and-streaming'            = 'Message Queues & Streaming'
  '10-stream-processing'                       = 'Stream Processing'
  '11-batch-big-data'                          = 'Batch & Big Data'
  '12-data-warehousing'                        = 'Data Warehousing'
  '14-workflow-orchestration-and-coordination' = 'Coordination & Orchestration'
}

function Get-FirstH1 {
  param([string[]]$lines)
  foreach ($l in $lines) {
    if ($l -match '^#\s+(.+?)\s*$') { return $Matches[1] }
  }
  return $null
}

function Get-FirstNonEmpty {
  param([string[]]$lines, [int]$startIndex)
  for ($i = $startIndex; $i -lt $lines.Length; $i++) {
    $t = $lines[$i].Trim()
    if ($t.Length -gt 0 -and -not $t.StartsWith('#') -and -not $t.StartsWith('>')) {
      # Strip basic markdown emphasis to keep the description plain text.
      $clean = $t -replace '\*\*([^*]+)\*\*', '$1' `
                  -replace '\*([^*]+)\*', '$1' `
                  -replace '`([^`]+)`', '$1' `
                  -replace '\[([^\]]+)\]\([^)]+\)', '$1'
      return $clean
    }
  }
  return $null
}

function Convert-File {
  param([System.IO.FileInfo]$file)

  $raw = Get-Content $file.FullName -Raw
  if ($raw -match '^---\s*\n') {
    Write-Host "skip (has frontmatter): $($file.FullName)"
    return
  }

  $lines = $raw -split "(`r`n|`n)"
  # Filter the actual content lines (the split keeps newlines as separate tokens)
  $contentLines = @()
  foreach ($l in $lines) { if ($l -ne "`r`n" -and $l -ne "`n") { $contentLines += $l } }

  $title = Get-FirstH1 -lines $contentLines
  if (-not $title) { $title = [System.IO.Path]::GetFileNameWithoutExtension($file.Name) }

  # First H1 index in $contentLines
  $h1Index = -1
  for ($i = 0; $i -lt $contentLines.Length; $i++) {
    if ($contentLines[$i] -match '^#\s+') { $h1Index = $i; break }
  }

  $description = Get-FirstNonEmpty -lines $contentLines -startIndex ($h1Index + 1)
  if (-not $description) { $description = "$title — High Level Design notes." }
  if ($description.Length -gt 220) { $description = $description.Substring(0, 217) + '...' }

  # Drop the first H1 line (frontmatter title replaces it)
  if ($h1Index -ge 0) {
    $contentLines = $contentLines[($h1Index + 1)..($contentLines.Length - 1)]
  }
  # Trim leading blank lines
  while ($contentLines.Length -gt 0 -and [string]::IsNullOrWhiteSpace($contentLines[0])) {
    $contentLines = $contentLines[1..($contentLines.Length - 1)]
  }

  $body = ($contentLines -join "`r`n").TrimEnd()
  $titleEsc = $title -replace '"', '\"'
  $descEsc  = $description -replace '"', '\"'

  $front = "---`r`ntitle: ""$titleEsc""`r`ndescription: ""$descEsc""`r`n---`r`n`r`n"

  # Write as .mdx so MDX components can be embedded later if desired.
  $newPath = [System.IO.Path]::ChangeExtension($file.FullName, '.mdx')
  Set-Content -Path $newPath -Value ($front + $body) -NoNewline -Encoding UTF8

  if ($newPath -ne $file.FullName) {
    Remove-Item $file.FullName -Force
  }
  Write-Host "  -> $newPath"
}

# Convert all .md files (recursive)
Get-ChildItem -Path $root -Recurse -Filter *.md -File | ForEach-Object { Convert-File $_ }

# ---------------------------------------------------------------------------
# Helper: build a JSON string with `pages` always emitted as an array.
function Format-MetaJson {
  param([string]$title, [string[]]$pages)
  $items = ($pages | ForEach-Object { '"' + ($_ -replace '"', '\"') + '"' }) -join ",`r`n    "
  $titleEsc = $title -replace '"', '\"'
  return "{`r`n  `"title`": `"$titleEsc`",`r`n  `"pages`": [`r`n    $items`r`n  ]`r`n}`r`n"
}

# Top-level meta.json
$rootJson = Format-MetaJson -title 'Documentation' -pages (@('index') + $categoryOrder)
[System.IO.File]::WriteAllText((Join-Path $root 'meta.json'), $rootJson, [System.Text.UTF8Encoding]::new($false))

# Generate meta.json for each category folder
foreach ($cat in $categoryOrder) {
  $dir = Join-Path $root $cat
  if (-not (Test-Path $dir)) { continue }
  $files = @(Get-ChildItem -Path $dir -Filter *.mdx -File | Sort-Object Name |
             ForEach-Object { [System.IO.Path]::GetFileNameWithoutExtension($_.Name) })
  $catJson = Format-MetaJson -title $categoryTitles[$cat] -pages $files
  [System.IO.File]::WriteAllText((Join-Path $dir 'meta.json'), $catJson, [System.Text.UTF8Encoding]::new($false))
  Write-Host "meta.json -> $dir"
}

Write-Host "`nDone."
