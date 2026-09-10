$ErrorActionPreference = "Stop"
$root = (Resolve-Path $PSScriptRoot).Path
$files = Get-ChildItem -Path $root -Recurse -File | Where-Object {
  $_.FullName -notmatch '[\\/](\.git|node_modules|\.kombai)[\\/]' -and
  $_.Extension -in @('.html', '.js', '.css', '.json')
}
$pattern = '(?:src|href|manifest|url)\s*=\s*"([^"#?]+)"'
$missing = @()

foreach ($file in $files) {
  $text = Get-Content -Raw -LiteralPath $file.FullName
  foreach ($match in [regex]::Matches($text, $pattern, [Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
    $ref = $match.Groups[1].Value
    if ([string]::IsNullOrWhiteSpace($ref) -or $ref -match '^(https?:|mailto:|data:|javascript:|//|\$\{)') { continue }
    $candidate = Join-Path $file.DirectoryName $ref.Replace('/', [IO.Path]::DirectorySeparatorChar)
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
      $missing += "{0}: {1}" -f $file.FullName.Substring($root.Length + 1), $ref
    }
  }
}

if ($missing.Count) {
  Write-Host "Missing same-origin references:" -ForegroundColor Red
  $missing | ForEach-Object { Write-Host " - $_" }
  exit 1
}

Write-Host "Reference check passed: no missing same-origin paths found." -ForegroundColor Green
