$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 5500
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Prefixes.Add("http://127.0.0.1:$port/")
try {
  $listener.Start()
  Write-Host "==========================================="
  Write-Host "  CLASSCARE ATTENDANCE SYSTEM"
  Write-Host "  Running on: http://localhost:$port/"
  Write-Host "  Root folder: $root"
  Write-Host "==========================================="
  Write-Host "Press Ctrl+C to stop this server."
  Write-Host ""
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
    ".webmanifest" = "application/manifest+json"
    ".map"  = "application/json; charset=utf-8"
    ".md"   = "text/markdown; charset=utf-8"
    ".txt"  = "text/plain; charset=utf-8"
  }
  while ($listener.IsListening) {
    try {
      $ctx = $listener.GetContext()
      $reqUrl = $ctx.Request.Url.AbsolutePath
      $rel = [Uri]::UnescapeDataString($reqUrl.TrimStart("/"))
      if ([string]::IsNullOrWhiteSpace($rel)) { $rel = "index.html" }
      $rel = $rel.Replace('/', [IO.Path]::DirectorySeparatorChar)
      $file = [IO.Path]::GetFullPath((Join-Path $root $rel))
      if (Test-Path $file -PathType Container) {
        $file = [IO.Path]::GetFullPath((Join-Path $file "index.html"))
      }
      if (-not $file.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path $file -PathType Leaf)) {
        $ctx.Response.StatusCode = 404
        $body = [Text.Encoding]::UTF8.GetBytes("404 Not Found: $rel")
        $ctx.Response.ContentType = "text/plain; charset=utf-8"
      } else {
        $body = [IO.File]::ReadAllBytes($file)
        $ext = [IO.Path]::GetExtension($file).ToLowerInvariant()
        $ctx.Response.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
        $ctx.Response.StatusCode = 200
      }
      $ctx.Response.ContentLength64 = $body.Length
      $ctx.Response.OutputStream.Write($body, 0, $body.Length)
      $ctx.Response.Close()
    } catch {
      # Ignore connection aborts from client closing connection early
    }
  }
} finally {
  if ($listener.IsListening) { $listener.Stop() }
  $listener.Close()
  Write-Host "Server stopped."
}
