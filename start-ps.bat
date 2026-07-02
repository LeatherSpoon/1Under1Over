@echo off
cd /d "%~dp0"
echo ============================================
echo  Processing Power - Local Game Server
echo  (PowerShell - no installs required)
echo ============================================
echo.
echo Press Ctrl+C to stop the server.
echo.

powershell -ExecutionPolicy Bypass -Command ^
 "$p=8080; $r='%~dp0'.TrimEnd('\'); $h=[System.Net.HttpListener]::new(); "^
 "try{$h.Prefixes.Add(\"http://localhost:$p/\"); $h.Start()}catch{"^
 "  $p=8081; $h=[System.Net.HttpListener]::new(); $h.Prefixes.Add(\"http://localhost:$p/\"); $h.Start()}; "^
 "Write-Host \"Open http://localhost:$p/ in your browser\" -F Cyan; "^
 "Start-Process \"http://localhost:$p/\"; "^
 "$m=@{'.html'='text/html';'.css'='text/css';'.js'='application/javascript';'.json'='application/json';'.png'='image/png';'.jpg'='image/jpeg';'.svg'='image/svg+xml';'.gif'='image/gif';'.ico'='image/x-icon';'.wav'='audio/wav';'.mp3'='audio/mpeg';'.ogg'='audio/ogg';'.glb'='model/gltf-binary';'.woff2'='font/woff2'}; "^
 "while($h.IsListening){"^
 "  $c=$h.GetContext(); $u=$c.Request.Url.LocalPath; if($u -eq '/'){$u='/index.html'}; "^
 "  $f=Join-Path $r ($u-replace'/','\\'); "^
 "  if((Test-Path $f -PathType Leaf) -and [IO.Path]::GetFullPath($f).StartsWith($r)){"^
 "    $e=[IO.Path]::GetExtension($f).ToLower(); "^
 "    $c.Response.ContentType=if($m[$e]){$m[$e]}else{'application/octet-stream'}; "^
 "    $c.Response.Headers.Add('Access-Control-Allow-Origin','*'); "^
 "    $b=[IO.File]::ReadAllBytes($f); $c.Response.ContentLength64=$b.Length; "^
 "    $c.Response.OutputStream.Write($b,0,$b.Length); Write-Host \"[200] $u\" -F Green"^
 "  }else{"^
 "    $c.Response.StatusCode=404; $b=[Text.Encoding]::UTF8.GetBytes('404'); "^
 "    $c.Response.ContentLength64=$b.Length; $c.Response.OutputStream.Write($b,0,$b.Length); "^
 "    Write-Host \"[404] $u\" -F Yellow}; "^
 "  $c.Response.Close()}"

pause
