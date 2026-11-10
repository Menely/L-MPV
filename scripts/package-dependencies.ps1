param(
    [Parameter(Mandatory)][ValidateSet('Native', 'Inference')][string]$Kind,
    [switch]$ResolveOnly
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$pins = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'animejanai-dependencies.json') -Raw | ConvertFrom-Json
$headers = @{ 'User-Agent' = 'L-MPV-dependencies'; 'Cache-Control' = 'no-cache' }
$apiHeaders = $headers.Clone()
if ($env:GH_TOKEN) { $apiHeaders.Authorization = "Bearer $env:GH_TOKEN" }

function Get-ReleaseAsset([string]$Repository, [string]$Tag, [string]$Name) {
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repository/releases/tags/$Tag" -Headers $apiHeaders
    $assets = @($release.assets | Where-Object name -EQ $Name)
    if ($assets.Count -ne 1 -or $assets[0].size -le 0) { throw "Missing release asset: $Repository/$Tag/$Name" }
    return $assets[0]
}
function Receive-File([string]$Url, [string]$Destination) {
    Write-Host "Downloading $Url"
    Invoke-WebRequest -Uri $Url -OutFile $Destination -Headers $headers -TimeoutSec 300 -MaximumRetryCount 3 -RetryIntervalSec 5
}
function Receive-Asset($Asset, [string]$Destination) {
    Receive-File $Asset.browser_download_url $Destination
    if ((Get-Item -LiteralPath $Destination).Length -ne $Asset.size) { throw "Asset size mismatch: $Destination" }
    if ($Asset.PSObject.Properties.Name -contains 'digest' -and $Asset.digest -match '^sha256:([a-f0-9]{64})$') {
        if ((Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash -ne $Matches[1]) { throw "SHA256 mismatch: $Destination" }
    }
}
function Invoke-Archive([string[]]$Arguments) {
    & $script:sevenZip @Arguments | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "7-Zip failed ($LASTEXITCODE): $($Arguments -join ' ')" }
}
function New-FlatArchive([string]$Source, [string]$Destination) {
    $target = [IO.Path]::GetFullPath($Destination)
    if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Force }
    Push-Location -LiteralPath $Source
    try {
        Invoke-Archive @('a', '-y', '-mx=5', $target, '.\*')
    } finally { Pop-Location }
    Invoke-Archive @('t', $target)
    $listing = & $script:sevenZip l -slt $target
    if ($LASTEXITCODE -ne 0) { throw "Cannot list $target" }
    $entries = @($listing | Where-Object { $_ -like 'Path = *' } | Select-Object -Skip 1)
    if ($entries.Count -eq 0 -or @($entries | Where-Object { $_ -match 'Path = .*[/\\]' }).Count -ne 0) {
        throw "Package must contain files at its root: $target"
    }
}
function Require-File([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf) -or (Get-Item -LiteralPath $Path).Length -eq 0) { throw "Missing/empty file: $Path" }
}

# Resolve every URL before downloading or publishing anything. No silent version fallback.
$mpv = Get-ReleaseAsset 'the-database/mpv-winbuild' $pins.mpv_release $pins.mpv_asset
$resolved = [ordered]@{ animejanai = $pins.animejanai; aji = $pins.aji; tensorrt = $pins.tensorrt; libmpv = $mpv.browser_download_url }
if ($Kind -eq 'Native') {
    # Gyan's official latest-git mirror resolves to an immutable release tag.
    $mirror = Invoke-WebRequest -Uri 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-git-github' -Method Head -Headers $headers -TimeoutSec 15 -UseBasicParsing
    $finalUri = if ($mirror.BaseResponse.PSObject.Properties.Name -contains 'ResponseUri') { $mirror.BaseResponse.ResponseUri } else { $mirror.BaseResponse.RequestMessage.RequestUri }
    $tag = $finalUri.Segments[-1]
    if ($tag -notmatch '^\d{4}-\d{2}-\d{2}-git-[a-f0-9]+$') { throw "Unexpected FFmpeg mirror tag: $tag" }
    $ffmpegAsset = Get-ReleaseAsset 'GyanD/codexffmpeg' $tag "ffmpeg-$tag-essentials_build.7z"
    $resolved.ffmpeg = $ffmpegAsset.browser_download_url
    $page = Invoke-WebRequest -Uri 'https://mediaarea.net/en/MediaInfo/Download/Windows' -Headers $headers -TimeoutSec 15 -UseBasicParsing
    $pattern = '(?:https://mediaarea\.net)?/download/binary/libmediainfo0/(?<version>\d+\.\d+(?:\.\d+)?)/MediaInfo_DLL_[^"<>\s/]+_Windows_x64_WithoutInstaller\.zip'
    $links = @([regex]::Matches($page.Content, $pattern) | Sort-Object { [version]$_.Groups['version'].Value } -Descending)
    if ($links.Count -eq 0) { throw 'Official MediaInfo page has no Windows x64 DLL ZIP; refusing to use an old pinned version.' }
    $resolved.mediainfo = ([uri]::new([uri]'https://mediaarea.net', $links[0].Value)).AbsoluteUri
} else {
    $aji = Get-ReleaseAsset 'the-database/animejanai-inference' $pins.aji 'aji-windows-x64.zip'
    $resolved.aji_url = $aji.browser_download_url
    $components = @('runtime') + @($pins.architectures)
    $assets = @{}
    $runtimeRepo = if ($pins.PSObject.Properties.Name -contains 'runtime_repo') { $pins.runtime_repo } else { 'the-database/animejanai-inference' }
    $runtimeTag = if ($pins.PSObject.Properties.Name -contains 'runtime_tag') { $pins.runtime_tag } else { 'runtime-2' }
    foreach ($component in $components) {
        $name = "component-trt-$component.7z"
        $upstreamName = "trt-$component-windows-x64.7z"
        $assets[$name] = Get-ReleaseAsset $runtimeRepo $runtimeTag $upstreamName
        $resolved[$name] = $assets[$name].browser_download_url
    }
}
$resolved | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath 'dependency-sources.json' -Encoding utf8
Get-Content -LiteralPath 'dependency-sources.json' | Out-Host
if ($ResolveOnly) { return }
$command = Get-Command 7z -ErrorAction SilentlyContinue
$script:sevenZip = if ($command) { $command.Source } elseif (Test-Path 'C:/Program Files/7-Zip/7z.exe') { 'C:/Program Files/7-Zip/7z.exe' } else { throw '7-Zip is required' }

if ($Kind -eq 'Inference') {
    Receive-Asset $aji 'aji-windows-x64.zip'
    Invoke-Archive @('t', 'aji-windows-x64.zip')
    Invoke-Archive @('x', '-y', 'aji-windows-x64.zip', '-oaji-check')
    foreach ($file in @('aji.dll', 'aji_trt.dll', 'aji_dml.dll')) { Require-File "aji-check/$file" }
    foreach ($component in $components) {
        $name = "component-trt-$component.7z"
        $raw = "download-$name"
        $unpacked = "unpacked-$component"
        Receive-Asset $assets[$name] $raw
        Invoke-Archive @('t', $raw)
        Invoke-Archive @('x', '-y', $raw, "-o$unpacked")
        $source = if (Test-Path -LiteralPath (Join-Path $unpacked 'animejanai/inference') -PathType Container) {
            Join-Path $unpacked 'animejanai/inference'
        } else {
            $unpacked
        }
        if ($component -eq 'runtime') {
            foreach ($file in @('trtexec.exe', 'nvinfer_11.dll', 'cudart64_13.dll')) { Require-File (Join-Path $source $file) }
        } elseif (@(Get-ChildItem -LiteralPath $source -Recurse -Filter 'nvinfer_builder_resource_*.dll').Count -eq 0) {
            throw "No TensorRT builder in $name"
        }
        New-FlatArchive $source $name
    }

    $ortVer = $pins.onnxruntime_directml
    $ortName = "microsoft.ml.onnxruntime.directml.$ortVer.nupkg"
    Receive-File "https://api.nuget.org/v3-flatcontainer/microsoft.ml.onnxruntime.directml/$ortVer/$ortName" $ortName
    Require-File $ortName

    $dmlVer = $pins.directml
    $dmlName = "microsoft.ai.directml.$dmlVer.nupkg"
    Receive-File "https://api.nuget.org/v3-flatcontainer/microsoft.ai.directml/$dmlVer/$dmlName" $dmlName
    Require-File $dmlName

    Write-Host "Resolving AnimeJaNai target tag: $($pins.animejanai) (from animejanai-dependencies.json)" -ForegroundColor Cyan
    Write-Host "Resolving aji bridge target tag: $($pins.aji) (from animejanai-dependencies.json)" -ForegroundColor Cyan
    Write-Host "Resolving TensorRT target version: $($pins.tensorrt)" -ForegroundColor Cyan

    $archives = [ordered]@{}
    $archiveList = @('aji-windows-x64.zip', $ortName, $dmlName) + @($components | ForEach-Object { "component-trt-$_.7z" })
    if (Test-Path -LiteralPath 'l-mpv_convert_fp16.zip' -PathType Leaf) {
        $archiveList += 'l-mpv_convert_fp16.zip'
    }
    foreach ($archName in $archiveList) {
        Require-File $archName
        $item = Get-Item -LiteralPath $archName
        $hash = (Get-FileHash -LiteralPath $archName -Algorithm SHA256).Hash.ToLowerInvariant()
        $archives[$archName] = [ordered]@{
            sha256 = $hash
            size   = [int64]$item.Length
        }
    }
    $resolved.build_date = (Get-Date -AsUTC).ToString("yyyy-MM-dd HH:mm:ss 'UTC'")
    $resolved.upstream_tags = [ordered]@{
        animejanai = "https://github.com/the-database/mpv-AnimeJaNai/releases/tag/$($pins.animejanai)"
        aji        = "https://github.com/the-database/animejanai-inference/releases/tag/$($pins.aji)"
        tensorrt   = "NVIDIA TensorRT $($pins.tensorrt)"
        mpv_target = "https://github.com/the-database/mpv-winbuild/releases/tag/$($pins.mpv_release)"
    }
    $resolved.archives = $archives
    $resolved | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath 'dependency-sources.json' -Encoding utf8
    Get-Content -LiteralPath 'dependency-sources.json' | Out-Host

    # Генерация подробной подписи релиза для публикации в GitHub Actions
    $releaseNotes = @"
# 📦 L-MPV Inference Engines v1

**Дата сборки:** $((Get-Date -AsUTC).ToString("yyyy-MM-dd HH:mm:ss 'UTC'"))

### 🏷️ Исходные версии компонентов (Upstream Sources)
- **AnimeJaNai (DirectML / TensorRT):** [$($pins.animejanai)](https://github.com/the-database/mpv-AnimeJaNai/releases/tag/$($pins.animejanai))
- **aji Bridge:** [$($pins.aji)](https://github.com/the-database/animejanai-inference/releases/tag/$($pins.aji))
- **NVIDIA TensorRT Runtime:** ``$($pins.tensorrt)`` (CUDA 13)
- **DirectML / OnnxRuntime:** ``$($pins.directml)`` / ``$($pins.onnxruntime_directml)`` (NuGet)
- **libmpv Target Build:** [$($pins.mpv_release)](https://github.com/the-database/mpv-winbuild/releases/tag/$($pins.mpv_release))

### 🛡️ Контрольные суммы архивов (SHA-256)
| Файл архива | Размер | SHA-256 |
| :--- | :--- | :--- |
"@

    foreach ($archName in $archiveList) {
        $archInfo = $archives[$archName]
        $sizeKb = [math]::Round($archInfo.size / 1KB, 1)
        $releaseNotes += "`n| ``$archName`` | $sizeKb KB | ``$($archInfo.sha256)`` |"
    }

    $releaseNotes += "`n`n> *Пакеты оптимизированы для плоской структуры каталога ``inference/`` без промежуточных папок animejanai.*`n"
    Set-Content -LiteralPath 'inference-release-notes.md' -Value $releaseNotes -Encoding utf8
    Write-Host "Generated inference-release-notes.md successfully."
    if ($env:GITHUB_STEP_SUMMARY) {
        $releaseNotes | Out-File -FilePath $env:GITHUB_STEP_SUMMARY -Append -Encoding utf8
    }
} else {
    Receive-Asset $mpv 'mpv-dev.7z'
    Receive-Asset $ffmpegAsset 'ffmpeg.7z'
    Receive-File 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-git-essentials.7z.sha256' 'ffmpeg.sha256'
    $checksum = [regex]::Match((Get-Content 'ffmpeg.sha256' -Raw), '(?i)\b[a-f0-9]{64}\b').Value
    if (-not $checksum -or (Get-FileHash 'ffmpeg.7z' -Algorithm SHA256).Hash -ne $checksum) { throw 'FFmpeg SHA256 mismatch (upstream may have changed during download); rerun with a consistent snapshot.' }
    Receive-File $resolved.mediainfo 'mediainfo.zip'
    foreach ($archive in @('mpv-dev.7z', 'ffmpeg.7z', 'mediainfo.zip')) {
        Invoke-Archive @('t', $archive)
        Invoke-Archive @('x', '-y', $archive, "-oextract-$archive")
    }
    New-Item -ItemType Directory -Path dist_libs -Force | Out-Null
    $targets = @{ 'mpv-dev.7z' = 'libmpv-2.dll'; 'ffmpeg.7z' = 'ffmpeg.exe'; 'mediainfo.zip' = 'MediaInfo.dll' }
    foreach ($archive in $targets.Keys) {
        $files = @(Get-ChildItem -LiteralPath "extract-$archive" -Recurse -File -Filter $targets[$archive])
        if ($files.Count -ne 1) { throw "Expected exactly one $($targets[$archive]) in $archive, found $($files.Count)" }
        Copy-Item -LiteralPath $files[0].FullName -Destination (Join-Path 'dist_libs' $targets[$archive]) -Force
    }
    $dllText = [Text.Encoding]::ASCII.GetString([IO.File]::ReadAllBytes((Resolve-Path 'dist_libs/libmpv-2.dll')))
    if ($dllText -notmatch 'animejanai') { throw 'libmpv has no animejanai filter marker' }
    $version = & ./dist_libs/ffmpeg.exe -version 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0 -or $version -notmatch 'ffmpeg version') { throw 'FFmpeg smoke test failed' }
    Write-Host $version
    # Stable lowercase names preserve the existing release consumer contract.
    Rename-Item -LiteralPath 'dist_libs/MediaInfo.dll' -NewName 'mediainfo.dll'
    python (Join-Path $PSScriptRoot 'verify-native-dependencies.py') dist_libs --ffmpeg-tag $tag --mediainfo-version $links[0].Groups['version'].Value --report dependency-versions.json
    if ($LASTEXITCODE -ne 0) { throw 'Native binary version/API verification failed' }
    Compress-Archive -Path 'dist_libs/*' -DestinationPath 'mpv_libs.zip' -Force
    Invoke-Archive @('t', 'mpv_libs.zip')

    # Генерация подробной подписи релиза нативных зависимостей
    $nativeVersions = Get-Content -LiteralPath 'dependency-versions.json' -Raw | ConvertFrom-Json
    $nativeHashes = [ordered]@{}
    foreach ($fn in @('libmpv-2.dll', 'ffmpeg.exe', 'mediainfo.dll')) {
        $p = Join-Path 'dist_libs' $fn
        $nativeHashes[$fn] = [ordered]@{
            size = (Get-Item $p).Length
            sha256 = (Get-FileHash $p -Algorithm SHA256).Hash.ToLowerInvariant()
        }
    }
    $zipItem = Get-Item 'mpv_libs.zip'
    $zipHash = (Get-FileHash 'mpv_libs.zip' -Algorithm SHA256).Hash.ToLowerInvariant()

    $depsNotes = @"
# 📦 L-MPV Build Dependencies v1 (Native)

**Дата сборки:** $((Get-Date -AsUTC).ToString("yyyy-MM-dd HH:mm:ss 'UTC'"))

### 🏷️ Исходные версии компонентов (Upstream Sources)
- **libmpv-2.dll (с видеофильтром vf_animejanai):** [$($pins.mpv_release)](https://github.com/the-database/mpv-winbuild/releases/tag/$($pins.mpv_release))  
  *Отчёт C-API:* ``$($nativeVersions.libmpv)``
- **FFmpeg (ffmpeg.exe):** [$tag](https://github.com/GyanD/codexffmpeg/releases/tag/$tag) (gyan.dev mirror)  
  *Отчёт CLI:* ``$($nativeVersions.ffmpeg)``
- **MediaInfo (mediainfo.dll):** [v$($links[0].Groups['version'].Value)](https://mediaarea.net/en/MediaInfo/Download/Windows)  
  *Отчёт C-API:* ``$($nativeVersions.mediainfo)``

### 🛡️ Контрольные суммы файлов (SHA-256)
| Файл | Размер | SHA-256 |
| :--- | :--- | :--- |
| ``mpv_libs.zip`` (архив) | $([math]::Round($zipItem.Length / 1MB, 2)) MB | ``$zipHash`` |
| ``libmpv-2.dll`` | $([math]::Round($nativeHashes['libmpv-2.dll'].size / 1MB, 2)) MB | ``$($nativeHashes['libmpv-2.dll'].sha256)`` |
| ``ffmpeg.exe`` | $([math]::Round($nativeHashes['ffmpeg.exe'].size / 1MB, 2)) MB | ``$($nativeHashes['ffmpeg.exe'].sha256)`` |
| ``mediainfo.dll`` | $([math]::Round($nativeHashes['mediainfo.dll'].size / 1MB, 2)) MB | ``$($nativeHashes['mediainfo.dll'].sha256)`` |

> *Все бинарники проверены тестом заголовков PE x64, инициализацией C-API ctypes и дымовыми тестами вызовов.*
"@

    Set-Content -LiteralPath 'deps-release-notes.md' -Value $depsNotes -Encoding utf8
    Write-Host "Generated deps-release-notes.md successfully."
    if ($env:GITHUB_STEP_SUMMARY) {
        $depsNotes | Out-File -FilePath $env:GITHUB_STEP_SUMMARY -Append -Encoding utf8
    }
}
