param(
  [Parameter(Mandatory = $true)][string]$Replay,
  [Parameter(Mandatory = $false)][string]$SkinDir,
  [Parameter(Mandatory = $false)][string]$Beatmap,
  [Parameter(Mandatory = $true)][string]$Output,
  [Parameter(Mandatory = $false)][int]$VideoWidth,
  [Parameter(Mandatory = $false)][int]$VideoHeight,
  [Parameter(Mandatory = $false)][int]$VideoFps,
  [Parameter(Mandatory = $false)][int]$MusicVolume,
  [Parameter(Mandatory = $false)][int]$HitsoundVolume,
  [Parameter(Mandatory = $false)][string]$JobSPatch,
  [Parameter(Mandatory = $false)][string]$JobSPatchB64,
  [Parameter(Mandatory = $false)][string]$SkipIntro
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Step([string]$Message) {
  Write-Host ("[danser-wrapper] " + $Message)
}

function Normalize-OptionalString([string]$Value) {
  if ($null -eq $Value) { return $null }
  $trimmed = $Value.Trim()
  if ([string]::IsNullOrWhiteSpace($trimmed)) { return $null }
  return $trimmed
}

function Resolve-FullPath([string]$PathValue) {
  if ([string]::IsNullOrWhiteSpace($PathValue)) { return $null }
  return [System.IO.Path]::GetFullPath($PathValue)
}

function Decode-Base64Utf8([string]$Value) {
  $raw = Normalize-OptionalString $Value
  if (-not $raw) { return $null }
  try {
    $bytes = [System.Convert]::FromBase64String($raw)
    return [System.Text.Encoding]::UTF8.GetString($bytes)
  } catch {
    throw "JobSPatchB64 is not valid base64 UTF-8 payload: $($_.Exception.Message)"
  }
}

function Escape-JsonForNativeArgument([string]$JsonText) {
  $raw = Normalize-OptionalString $JsonText
  if (-not $raw) { return $null }
  # PowerShell on Windows may strip unescaped quotes when forwarding native args.
  return $raw.Replace('"', '\"')
}

function Find-FirstCommand([string[]]$Names) {
  foreach ($name in $Names) {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
  }
  return $null
}

function Get-DanserExecutable {
  $envPath = Normalize-OptionalString $env:DANSER_CLI_PATH
  if ($envPath) {
    $full = Resolve-FullPath $envPath
    if (-not (Test-Path -LiteralPath $full)) {
      throw "DANSER_CLI_PATH is set but file does not exist: $full"
    }
    return $full
  }

  $found = Find-FirstCommand @("danser-cli.exe", "danser-cli", "danser.exe", "danser")
  if ($found) { return $found }

  throw "danser-cli was not found. Set DANSER_CLI_PATH in .env or add danser-cli to PATH."
}

function Get-FfmpegExecutable {
  $envPath = Normalize-OptionalString $env:FFMPEG_PATH
  if ($envPath) {
    $full = Resolve-FullPath $envPath
    if (-not (Test-Path -LiteralPath $full)) {
      throw "FFMPEG_PATH is set but file does not exist: $full"
    }
    return $full
  }

  $found = Find-FirstCommand @("ffmpeg.exe", "ffmpeg")
  if ($found) { return $found }
  return $null
}

function Ensure-Directory([string]$DirPath) {
  if (-not (Test-Path -LiteralPath $DirPath)) {
    New-Item -ItemType Directory -Path $DirPath -Force | Out-Null
  }
}

function Copy-DirectoryContents([string]$SourceDir, [string]$DestDir) {
  Ensure-Directory $DestDir
  $items = Get-ChildItem -LiteralPath $SourceDir -Force -ErrorAction SilentlyContinue
  foreach ($item in $items) {
    Copy-Item -LiteralPath $item.FullName -Destination $DestDir -Recurse -Force
  }
}

function New-DirectoryJunctionOrNull([string]$LinkPath, [string]$TargetPath) {
  try {
    if (Test-Path -LiteralPath $LinkPath) {
      Remove-Item -LiteralPath $LinkPath -Recurse -Force -ErrorAction SilentlyContinue
    }
    New-Item -ItemType Junction -Path $LinkPath -Target $TargetPath -Force | Out-Null
    return (Resolve-FullPath $LinkPath)
  } catch {
    Write-Step ("Failed to create junction `"$LinkPath`" -> `"$TargetPath`": " + $_.Exception.Message)
    return $null
  }
}

function Expand-ZipToDirectory([string]$ZipPath, [string]$DestDir) {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  if (Test-Path -LiteralPath $DestDir) {
    Remove-Item -LiteralPath $DestDir -Recurse -Force
  }
  New-Item -ItemType Directory -Path $DestDir -Force | Out-Null
  [System.IO.Compression.ZipFile]::ExtractToDirectory($ZipPath, $DestDir)
}

function Get-BoolEnv([string]$Name, [bool]$Default) {
  $envItem = Get-Item -Path ("Env:" + $Name) -ErrorAction SilentlyContinue
  $raw = $null
  if ($envItem) { $raw = Normalize-OptionalString $envItem.Value }
  if ($null -eq $raw) { return $Default }
  switch -Regex ($raw.ToLowerInvariant()) {
    "^(1|true|yes|on)$" { return $true }
    "^(0|false|no|off)$" { return $false }
    default { return $Default }
  }
}

function Find-RenderedVideo([string]$OutputPath, [string]$TempOutBase) {
  if (Test-Path -LiteralPath $OutputPath) {
    return (Resolve-FullPath $OutputPath)
  }

  $dir = Split-Path -Parent $TempOutBase
  $baseName = [System.IO.Path]::GetFileName($TempOutBase)
  $videoExts = @(".mp4", ".mkv", ".avi", ".mov", ".webm")

  if (-not (Test-Path -LiteralPath $dir)) { return $null }

  $candidates = Get-ChildItem -LiteralPath $dir -File -ErrorAction SilentlyContinue |
    Where-Object {
      $_.BaseName -eq $baseName -or $_.BaseName -like "$baseName*"
    } |
    Where-Object {
      $videoExts -contains $_.Extension.ToLowerInvariant()
    } |
    Sort-Object LastWriteTimeUtc -Descending

  if ($candidates -and $candidates.Count -gt 0) {
    return $candidates[0].FullName
  }

  return $null
}

function Wait-RenderedVideo([string]$OutputPath, [string]$TempOutBase) {
  $timeoutMs = 12000
  $pollMs = 300
  $deadline = [DateTime]::UtcNow.AddMilliseconds($timeoutMs)

  do {
    $found = Find-RenderedVideo -OutputPath $OutputPath -TempOutBase $TempOutBase
    if ($found) { return $found }
    Start-Sleep -Milliseconds $pollMs
  } while ([DateTime]::UtcNow -lt $deadline)

  return (Find-RenderedVideo -OutputPath $OutputPath -TempOutBase $TempOutBase)
}

function Convert-ToMp4([string]$SourcePath, [string]$DestPath) {
  $ffmpeg = Get-FfmpegExecutable
  if (-not $ffmpeg) {
    throw "Rendered file is not mp4 and ffmpeg was not found to convert it. Source: $SourcePath"
  }

  Write-Step "Converting rendered file to mp4 via ffmpeg"
  & $ffmpeg `
    "-y" `
    "-i" $SourcePath `
    "-map" "0:v:0" `
    "-map" "0:a?" `
    "-c:v" "libx264" `
    "-preset" "fast" `
    "-crf" "18" `
    "-pix_fmt" "yuv420p" `
    "-c:a" "aac" `
    "-b:a" "192k" `
    $DestPath

  if ($LASTEXITCODE -ne 0) {
    throw "ffmpeg conversion failed with exit code $LASTEXITCODE"
  }
}

function Finalize-Output([string]$RenderedPath, [string]$ExpectedOutput) {
  $renderedFull = Resolve-FullPath $RenderedPath
  $expectedFull = Resolve-FullPath $ExpectedOutput
  Ensure-Directory (Split-Path -Parent $expectedFull)

  $renderedExt = [System.IO.Path]::GetExtension($renderedFull).ToLowerInvariant()
  $expectedExt = [System.IO.Path]::GetExtension($expectedFull).ToLowerInvariant()

  if ($renderedFull -ieq $expectedFull -and $renderedExt -eq ".mp4") {
    return
  }

  if ($renderedExt -eq ".mp4" -and $expectedExt -eq ".mp4") {
    if (Test-Path -LiteralPath $expectedFull) {
      Remove-Item -LiteralPath $expectedFull -Force
    }
    Move-Item -LiteralPath $renderedFull -Destination $expectedFull -Force
    return
  }

  Convert-ToMp4 -SourcePath $renderedFull -DestPath $expectedFull
}

function Build-SPatch(
  [string]$SongsRoot,
  [string]$SkinsRoot,
  [string]$JobSPatchJson
) {
  $patch = @{}
  $general = @{}

  if ($SongsRoot) { $general["OsuSongsDir"] = $SongsRoot }
  if ($SkinsRoot) { $general["OsuSkinsDir"] = $SkinsRoot }

  if ($general.Count -gt 0) {
    $patch["General"] = $general
  }

  $extraPatchJson = Normalize-OptionalString $env:DANSER_SPATCH_JSON
  if ($extraPatchJson) {
    try {
      $extraPatch = $extraPatchJson | ConvertFrom-Json -ErrorAction Stop
      foreach ($prop in $extraPatch.PSObject.Properties) {
        $patch[$prop.Name] = $prop.Value
      }
    } catch {
      throw "DANSER_SPATCH_JSON is not valid JSON: $($_.Exception.Message)"
    }
  }

  $jobPatchJson = Normalize-OptionalString $JobSPatchJson
  if ($jobPatchJson) {
    try {
      $jobPatch = $jobPatchJson | ConvertFrom-Json -ErrorAction Stop
      foreach ($prop in $jobPatch.PSObject.Properties) {
        $patch[$prop.Name] = $prop.Value
      }
    } catch {
      throw "JobSPatch JSON is not valid JSON: $($_.Exception.Message)"
    }
  }

  if ($patch.Count -eq 0) { return $null }
  return ($patch | ConvertTo-Json -Depth 12 -Compress)
}

$Replay = Resolve-FullPath (Normalize-OptionalString $Replay)
$SkinDir = Resolve-FullPath (Normalize-OptionalString $SkinDir)
$Beatmap = Resolve-FullPath (Normalize-OptionalString $Beatmap)
$Output = Resolve-FullPath (Normalize-OptionalString $Output)

if (-not $Replay -or -not (Test-Path -LiteralPath $Replay)) {
  throw "Replay file was not found: $Replay"
}
if (-not $Output) {
  throw "Output path is required"
}

$danserExe = Get-DanserExecutable
$danserExe = Resolve-FullPath $danserExe

$danserWorkDir = Normalize-OptionalString $env:DANSER_WORKDIR
if ($danserWorkDir) {
  $danserWorkDir = Resolve-FullPath $danserWorkDir
} else {
  $danserWorkDir = Split-Path -Parent $danserExe
}
if (-not (Test-Path -LiteralPath $danserWorkDir)) {
  throw "DANSER_WORKDIR does not exist: $danserWorkDir"
}

$settingsProfile = Normalize-OptionalString $env:DANSER_SETTINGS_PROFILE
if (-not $settingsProfile) { $settingsProfile = "default" }

$jobOutputDir = Split-Path -Parent $Output
Ensure-Directory $jobOutputDir

$jobIdHint = Split-Path -Leaf $jobOutputDir
if ([string]::IsNullOrWhiteSpace($jobIdHint)) {
  $jobIdHint = [Guid]::NewGuid().ToString()
}
$outputDriveRoot = [System.IO.Path]::GetPathRoot($Output)
if ([string]::IsNullOrWhiteSpace($outputDriveRoot)) {
  $outputDriveRoot = [System.IO.Path]::GetPathRoot((Get-Location).Path)
}
$wrapperTempRoot = Join-Path $outputDriveRoot "_danser_web_tmp"
Ensure-Directory $wrapperTempRoot

$jobTempDir = Join-Path $wrapperTempRoot $jobIdHint
if (Test-Path -LiteralPath $jobTempDir) {
  Remove-Item -LiteralPath $jobTempDir -Recurse -Force
}
New-Item -ItemType Directory -Path $jobTempDir -Force | Out-Null

$songsRoot = $null
$skinsRoot = $null
$skinName = $null
$danserOutRelativeBase = Join-Path "web" (Join-Path $jobIdHint "render")
$tempOutBase = Join-Path (Join-Path $danserWorkDir "videos") $danserOutRelativeBase
$wrapperSucceeded = $false

try {
  Write-Step ("Replay: " + $Replay)
  Write-Step ("SkinDir: " + ($(if ($SkinDir) { $SkinDir } else { "<none>" })))
  Write-Step ("Beatmap: " + ($(if ($Beatmap) { $Beatmap } else { "<none>" })))
  Write-Step ("Output: " + $Output)
  if ($VideoWidth -and $VideoHeight -and $VideoFps) {
    Write-Step ("Requested preset from site: {0}x{1}@{2} (danser settings profile controls actual render resolution unless patched)" -f $VideoWidth, $VideoHeight, $VideoFps)
  }
  if ($MusicVolume -or $HitsoundVolume) {
    Write-Step ("Requested mix from site: music={0}% hitsounds={1}% (apply via DANSER_SPATCH_JSON if your settings schema supports it)" -f $MusicVolume, $HitsoundVolume)
  }

  if ($Beatmap) {
    if (-not (Test-Path -LiteralPath $Beatmap)) {
      throw "Beatmap file was not found: $Beatmap"
    }

    $songsRoot = Join-Path $jobTempDir "Songs"
    $uploadSetDir = Join-Path $songsRoot "web_upload"
    Ensure-Directory $songsRoot

    $beatmapExt = [System.IO.Path]::GetExtension($Beatmap).ToLowerInvariant()
    switch ($beatmapExt) {
      ".osz" { Expand-ZipToDirectory -ZipPath $Beatmap -DestDir $uploadSetDir; break }
      ".zip" { Expand-ZipToDirectory -ZipPath $Beatmap -DestDir $uploadSetDir; break }
      ".osu" {
        Ensure-Directory $uploadSetDir
        Copy-Item -LiteralPath $Beatmap -Destination (Join-Path $uploadSetDir ([System.IO.Path]::GetFileName($Beatmap))) -Force
        break
      }
      default {
        Ensure-Directory $uploadSetDir
        Copy-Item -LiteralPath $Beatmap -Destination (Join-Path $uploadSetDir ([System.IO.Path]::GetFileName($Beatmap))) -Force
      }
    }

    $osuCount = @(Get-ChildItem -LiteralPath $songsRoot -Recurse -Filter *.osu -File -ErrorAction SilentlyContinue).Count
    Write-Step ("Prepared uploaded beatmap files for danser (found .osu files: " + $osuCount + ")")
  } else {
    $localSongsDirEnv = Normalize-OptionalString $env:DANSER_OSU_SONGS_DIR
    if ($localSongsDirEnv) {
      $localSongsDir = Resolve-FullPath $localSongsDirEnv
      if (-not (Test-Path -LiteralPath $localSongsDir)) {
        throw "DANSER_OSU_SONGS_DIR is set but does not exist: $localSongsDir"
      }

      $songsLink = Join-Path $jobTempDir "Songs"
      $junction = New-DirectoryJunctionOrNull -LinkPath $songsLink -TargetPath $localSongsDir
      if ($junction) {
        $songsRoot = $junction
        Write-Step ("Using local osu! Songs via junction (no beatmap upload): " + $songsRoot)
      } else {
        $songsRoot = $localSongsDir
        Write-Step ("Using local osu! Songs directly (no beatmap upload): " + $songsRoot)
        if ($songsRoot -match "\s") {
          Write-Step "Warning: local Songs path contains spaces and may break -sPatch argument parsing. Prefer a no-space junction path."
        }
      }
    }
  }

  if ($SkinDir) {
    if (-not (Test-Path -LiteralPath $SkinDir)) {
      throw "SkinDir was provided but does not exist: $SkinDir"
    }

    $skinsRoot = Join-Path $jobTempDir "Skins"
    $skinName = "skin"
    $skinTargetDir = Join-Path $skinsRoot $skinName
    if (Test-Path -LiteralPath $skinTargetDir) {
      Remove-Item -LiteralPath $skinTargetDir -Recurse -Force
    }
    Copy-DirectoryContents -SourceDir $SkinDir -DestDir $skinTargetDir
    Write-Step ("Prepared custom skin for danser: " + $skinName + " (copied to no-space temp dir)")
  }

  $jobPatchJsonResolved = $null
  $jobPatchB64 = Normalize-OptionalString $JobSPatchB64
  if ($jobPatchB64) {
    $jobPatchJsonResolved = Decode-Base64Utf8 $jobPatchB64
  } else {
    $jobPatchJsonResolved = $JobSPatch
  }

  $sPatch = Build-SPatch -SongsRoot $songsRoot -SkinsRoot $skinsRoot -JobSPatchJson $jobPatchJsonResolved
  if ($sPatch) {
    Write-Step ("Using -sPatch overrides: " + $sPatch)
  }

  $danserArgs = @()
  $danserArgs += "-replay=$Replay"
  $danserArgs += "-record"
  $danserArgs += "-settings=$settingsProfile"
  $danserArgs += "-out=$danserOutRelativeBase"

  if ($skinName) {
    $danserArgs += "-skin=$skinName"
  }
  if ($sPatch) {
    $sPatchForCli = Escape-JsonForNativeArgument $sPatch
    $danserArgs += "-sPatch=$sPatchForCli"
  }
  if (Get-BoolEnv -Name "DANSER_PRECISE_PROGRESS" -Default $true) {
    $danserArgs += "-preciseprogress"
  }
  if (Get-BoolEnv -Name "DANSER_NOUPDATECHECK" -Default $true) {
    $danserArgs += "-noupdatecheck"
  }
  if (Get-BoolEnv -Name "DANSER_NODB_CHECK" -Default $false) {
    $danserArgs += "-nodbcheck"
  }
  if (Get-BoolEnv -Name "DANSER_SKIP" -Default $false) {
    $danserArgs += "-skip"
  }
  if ((Normalize-OptionalString $SkipIntro) -in @("1", "true", "yes", "on")) {
    $danserArgs += "-skip"
  }

  $extraArgsRaw = Normalize-OptionalString $env:DANSER_EXTRA_ARGS
  if ($extraArgsRaw) {
    Write-Step "DANSER_EXTRA_ARGS is set, but this wrapper does not parse it automatically to avoid quoting bugs. Prefer DANSER_SPATCH_JSON or edit the script."
  }

  Write-Step ("danser executable: " + $danserExe)
  Write-Step ("danser workdir: " + $danserWorkDir)
  Write-Step ("danser args: " + ($danserArgs -join " "))

  Push-Location $danserWorkDir
  try {
    & $danserExe @danserArgs
    if ($LASTEXITCODE -ne 0) {
      throw "danser exited with code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }

  Write-Step ("Waiting for rendered file near: " + $tempOutBase)
  $renderedPath = Wait-RenderedVideo -OutputPath $Output -TempOutBase $tempOutBase
  if (-not $renderedPath) {
    throw ("danser finished but no rendered video was found. Checked output path and files near: " + $tempOutBase)
  }

  Write-Step ("Rendered file detected: " + $renderedPath)
  Finalize-Output -RenderedPath $renderedPath -ExpectedOutput $Output

  if (-not (Test-Path -LiteralPath $Output)) {
    throw "Final output file is missing after wrapper completed: $Output"
  }

  $size = (Get-Item -LiteralPath $Output).Length
  Write-Step ("Final mp4 ready: " + $Output + " (" + $size + " bytes)")
  $wrapperSucceeded = $true
}
finally {
  if (-not (Get-BoolEnv -Name "DANSER_KEEP_TEMP" -Default $false)) {
    if (Test-Path -LiteralPath $jobTempDir) {
      Remove-Item -LiteralPath $jobTempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    if ($wrapperSucceeded) {
      $danserRenderDir = Split-Path -Parent $tempOutBase
      if ($danserRenderDir -and (Test-Path -LiteralPath $danserRenderDir)) {
        Remove-Item -LiteralPath $danserRenderDir -Recurse -Force -ErrorAction SilentlyContinue
        $danserRenderParent = Split-Path -Parent $danserRenderDir
        if ($danserRenderParent -and (Test-Path -LiteralPath $danserRenderParent)) {
          $remaining = @(Get-ChildItem -LiteralPath $danserRenderParent -Force -ErrorAction SilentlyContinue)
          if ($remaining.Count -eq 0) {
            Remove-Item -LiteralPath $danserRenderParent -Recurse -Force -ErrorAction SilentlyContinue
          }
        }
      }
    } else {
      Write-Step ("Keeping danser render dir after failure for debugging: " + (Split-Path -Parent $tempOutBase))
    }
  } else {
    Write-Step ("Keeping temp dir for debugging: " + $jobTempDir)
  }
}
