# Refresh bundled product photographs from the checked-in sample feed snapshot.
$ErrorActionPreference = 'Stop'
$repoPath = Split-Path -Parent $PSScriptRoot
$feedPath = Join-Path $repoPath 'src/NineCube.Infrastructure/Persistence/catalogue.json'
$imagePath = Join-Path $repoPath 'web/public/products'
New-Item -ItemType Directory -Force -Path $imagePath | Out-Null
$feed = Get-Content -LiteralPath $feedPath -Raw | ConvertFrom-Json
foreach ($product in $feed.products) {
    if ($product.id -isnot [int] -or $product.id -le 0) { throw 'Invalid product ID.' }
    $uri = [Uri]$product.thumbnail
    if ($uri.Scheme -ne 'https' -or $uri.Host -ne 'cdn.dummyjson.com') { throw 'Unexpected image source.' }
    Invoke-WebRequest -Uri $uri -OutFile (Join-Path $imagePath "$($product.id).webp")
}
Write-Output "Downloaded $($feed.products.Count) product photographs."
