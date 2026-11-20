<# : Start Hint Coach.cmd
:: ======================================================================
:: FunHouse Hint Coach - start file. Plain notes for a teacher or school IT.
::
:: What this file does
::  - It starts Windows PowerShell 5.1, which is built into Windows 10
::    and Windows 11. Nothing is installed. No admin rights are needed.
::  - PowerShell runs a tiny web server, written in the text below.
::    It serves only the files in this folder (the USB pack).
::  - It listens on http://127.0.0.1 only. That address means
::    "this laptop". Other computers on the network cannot reach it.
::    It tries port 8765 first, then the next free port up to 8785.
::  - It makes no internet connection. It downloads nothing.
::  - It changes no system settings. "-ExecutionPolicy Bypass" applies
::    to this one PowerShell window only, and ends when it closes.
::  - It writes no files and keeps no logs.
::  - It opens the default web browser at the Hint Coach app.
::  - Closing this black window stops the server.
::
:: How it works
::  - This one file is read twice. Windows first runs the short batch
::    part (the lines up to "exit /b"). That part starts PowerShell and
::    hands it this same file. PowerShell skips this note (it sits
::    inside a PowerShell comment) and runs the server code below it.
::  - The server sends the headers Cross-Origin-Opener-Policy and
::    Cross-Origin-Embedder-Policy, so the browser may use several CPU
::    threads for the helper model. If the browser refuses, the app
::    falls back to one thread by itself.
::  - It refuses any request that tries to leave this folder.
::
:: The whole file is plain text. You can read every line before running it.
:: ======================================================================
@echo off
setlocal
title Hint Coach - close this window to stop
set "HC_ROOT=%~dp0"
set "HC_SELF=%~f0"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "Invoke-Expression ([IO.File]::ReadAllText($env:HC_SELF))"
if errorlevel 1 pause
exit /b
#>

# ---------------- PowerShell part: tiny local web server ----------------
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($env:HC_ROOT).TrimEnd('\')

$types = @{
  '.html' = 'text/html; charset=utf-8'
  '.js' = 'text/javascript; charset=utf-8'
  '.mjs' = 'text/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.wasm' = 'application/wasm'
  '.gguf' = 'application/octet-stream'
  '.webmanifest' = 'application/manifest+json'
  '.css' = 'text/css; charset=utf-8'
  '.svg' = 'image/svg+xml'
  '.png' = 'image/png'
  '.ico' = 'image/x-icon'
  '.txt' = 'text/plain; charset=utf-8'
  '.md' = 'text/plain; charset=utf-8'
}

# Find a free port, bound to 127.0.0.1 only.
$listener = $null
$port = 0
foreach ($p in 8765..8785) {
  $l = New-Object System.Net.HttpListener
  $l.Prefixes.Add("http://127.0.0.1:$p/")
  try { $l.Start(); $listener = $l; $port = $p; break } catch { $l.Close() }
}
if (-not $listener) {
  Write-Host 'Could not find a free port between 8765 and 8785. Close other copies of Hint Coach and try again.'
  Read-Host 'Press Enter to close'
  exit 1
}
$listener.IgnoreWriteExceptions = $true

# One request handler. Four copies run side by side, so the big model file
# does not hold up the small files.
$handler = {
  param($listener, $root, $types)

  function Send-Status($res, [int]$code, [string]$location) {
    $res.StatusCode = $code
    if ($location) { $res.RedirectLocation = $location }
    $res.ContentLength64 = 0
  }

  while ($listener.IsListening) {
    try { $ctx = $listener.GetContext() } catch { break }
    $req = $ctx.Request
    $res = $ctx.Response
    try {
      $res.AddHeader('Cross-Origin-Opener-Policy', 'same-origin')
      $res.AddHeader('Cross-Origin-Embedder-Policy', 'require-corp')
      $res.AddHeader('Cross-Origin-Resource-Policy', 'same-origin')
      $res.AddHeader('X-Content-Type-Options', 'nosniff')
      $res.AddHeader('Cache-Control', 'no-cache')

      $method = $req.HttpMethod
      if ($method -ne 'GET' -and $method -ne 'HEAD') { Send-Status $res 405; continue }

      $raw = $req.Url.AbsolutePath
      $path = [Uri]::UnescapeDataString($raw)
      if ($path -eq '/') { Send-Status $res 302 '/app/'; continue }

      # Refuse anything that could leave this folder.
      $rel = $path.TrimStart('/')
      $parts = $rel -split '/'
      if ($path.Contains('\') -or $path.Contains(':') -or $path.Contains([string][char]0) -or
          $path.StartsWith('//') -or ($parts -contains '..') -or ($parts -contains '.')) {
        Send-Status $res 403; continue
      }
      $full = [IO.Path]::GetFullPath([IO.Path]::Combine($root, $rel.Replace('/', '\')))
      if (-not $full.StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase)) { Send-Status $res 403; continue }

      if ([IO.Directory]::Exists($full)) {
        if (-not $path.EndsWith('/')) { Send-Status $res 301 ($raw + '/'); continue }
        $full = [IO.Path]::Combine($full, 'index.html')
      }
      if (-not [IO.File]::Exists($full)) { Send-Status $res 404; continue }

      $ext = [IO.Path]::GetExtension($full).ToLowerInvariant()
      $type = $types[$ext]
      if (-not $type) { $type = 'application/octet-stream' }
      $len = (New-Object IO.FileInfo $full).Length
      $start = [long]0
      $end = $len - 1

      # Range requests (used for the big model file).
      $range = $req.Headers['Range']
      $partial = $false
      if ($range) {
        $ok = $false
        if ($range -match '^bytes=(\d*)-(\d*)$') {
          $a = $Matches[1]; $b = $Matches[2]
          if ($a -ne '') {
            $start = [long]$a
            if ($b -ne '') { $end = [Math]::Min([long]$b, $len - 1) }
            $ok = ($start -le $end)
          } elseif ($b -ne '') {
            $n = [long]$b
            $start = [Math]::Max([long]0, $len - $n)
            $ok = ($n -gt 0 -and $len -gt 0)
          }
        }
        if (-not $ok) {
          $res.AddHeader('Content-Range', "bytes */$len")
          Send-Status $res 416; continue
        }
        $partial = $true
      }

      $res.ContentType = $type
      $res.AddHeader('Accept-Ranges', 'bytes')
      $count = $end - $start + 1
      if ($len -eq 0) { $count = 0 }
      if ($partial) {
        $res.StatusCode = 206
        $res.AddHeader('Content-Range', "bytes $start-$end/$len")
      }
      $res.ContentLength64 = $count
      if ($method -eq 'GET' -and $count -gt 0) {
        $fs = New-Object IO.FileStream($full, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
        try {
          [void]$fs.Seek($start, [IO.SeekOrigin]::Begin)
          $buf = New-Object byte[] 1048576
          $left = $count
          while ($left -gt 0) {
            $n = $fs.Read($buf, 0, [int][Math]::Min([long]$buf.Length, $left))
            if ($n -le 0) { break }
            $res.OutputStream.Write($buf, 0, $n)
            $left -= $n
          }
        } finally { $fs.Dispose() }
      }
    } catch {
      # The browser closed the connection, or the file could not be read. Keep serving.
    } finally {
      try { $res.Close() } catch { }
    }
  }
}

$pool = [RunspaceFactory]::CreateRunspacePool(1, 4)
$pool.Open()
$workers = foreach ($i in 1..4) {
  $ps = [PowerShell]::Create()
  $ps.RunspacePool = $pool
  [void]$ps.AddScript($handler).AddArgument($listener).AddArgument($root).AddArgument($types)
  [pscustomobject]@{ PS = $ps; Handle = $ps.BeginInvoke() }
}

$url = "http://127.0.0.1:$port/app/"
Write-Host ''
Write-Host '  FunHouse Hint Coach is running on this laptop only.'
Write-Host "  Address: $url"
Write-Host "  Folder:  $root"
Write-Host ''
Write-Host '  Keep this window open while you use Hint Coach.'
Write-Host '  Close this window to stop it.'
Write-Host ''
Start-Process $url

try {
  while ($listener.IsListening) { Start-Sleep -Seconds 1 }
} finally {
  $listener.Stop()
  $listener.Close()
}
