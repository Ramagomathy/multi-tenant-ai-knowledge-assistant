Write-Host "`n--- App structure ---"
Get-ChildItem app -Recurse -File | Select-Object -ExpandProperty FullName
Write-Host "`n--- Components ---"
if (Test-Path src/components) { Get-ChildItem src/components -Recurse -File | Select-Object -ExpandProperty FullName }
Write-Host "`n--- Package dependencies ---"
npm ls --depth=0
