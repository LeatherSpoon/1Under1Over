$Root = "D:\Users\OWNER\Downloads\HTML_Project_Gemini-main\HTML_Project_Gemini-main"
$Output = "$Root\combined-js-files.md"

"# Combined JavaScript Files`n" | Out-File $Output -Encoding UTF8

Get-ChildItem $Root -Recurse -Filter *.js | Sort-Object FullName | ForEach-Object {
    $relativePath = $_.FullName.Replace($Root, "").TrimStart("\")
    
    Add-Content $Output "`n---`n"
    Add-Content $Output "## $relativePath"
    Add-Content $Output "`n```js"
    Get-Content $_.FullName | Add-Content $Output
    Add-Content $Output "```"
}

Write-Host "Created: $Output"