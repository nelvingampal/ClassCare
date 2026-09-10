$root = (Resolve-Path $PSScriptRoot).Path
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:5500/")

try {
  $listener.Start()
  Write-Host "ClassCare is running at http://localhost:5500/"
  Write-Host "Press Ctrl+C to stop the server."

  $mime = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
  }

  while ($listener.IsListening) {
    try {
      $context = $listener.GetContext()
      $relative = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart('/'))
      if ([string]::IsNullOrWhiteSpace($relative)) { $relative = "index.html" }
      $relative = $relative.Replace('/', [IO.Path]::DirectorySeparatorChar)
      $file = [IO.Path]::GetFullPath((Join-Path $root $relative))

      if (-not $file.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path $file -PathType Leaf)) {
        $context.Response.StatusCode = 404
        $body = [Text.Encoding]::UTF8.GetBytes("Not found")
      } else {
        $body = [IO.File]::ReadAllBytes($file)
        $extension = [IO.Path]::GetExtension($file).ToLowerInvariant()
        $context.Response.ContentType = if ($mime.ContainsKey($extension)) { $mime[$extension] } else { "application/octet-stream" }
        $context.Response.StatusCode = 200
      }

      $context.Response.ContentLength64 = $body.Length
      if ($context.Request.HttpMethod -ne "HEAD") {
        $context.Response.OutputStream.Write($body, 0, $body.Length)
      }
      $context.Response.Close()
    } catch {
      Write-Host "Request error: $_"
    }
  }
} finally {
  if ($listener.IsListening) { $listener.Stop() }
  $listener.Close()
}