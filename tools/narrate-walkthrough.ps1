# Speaks the walkthrough narration into one WAV per scene using the Windows desktop voice.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/narrate-walkthrough.ps1 `
#     -ScenesJson docs/walkthrough/scenes.json -OutDir docs/walkthrough/narration/raw
#
# The text comes from scenes.json, which the recorder writes, so the voice and the picture cannot
# drift apart between two hand-maintained lists. Nothing is synthesised here that is not on screen.
param(
    [Parameter(Mandatory = $true)][string]$ScenesJson,
    [Parameter(Mandatory = $true)][string]$OutDir,
    [string]$Voice = 'Microsoft David Desktop'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech

if (-not (Test-Path -LiteralPath $ScenesJson)) { throw "no scenes file at $ScenesJson" }
$scenes = (Get-Content -Raw -LiteralPath $ScenesJson | ConvertFrom-Json).scenes

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$installed = @($synth.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo.Name })
if ($installed -notcontains $Voice) {
    throw "voice '$Voice' is not installed; available: $($installed -join ', ')"
}
$synth.SelectVoice($Voice)
# A rate of -1 leaves a little room for the picture to breathe between the beats.
$synth.Rate = -1

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$number = 0
foreach ($scene in $scenes) {
    $number += 1
    $path = Join-Path $OutDir ('{0:d2}-{1}.wav' -f $number, $scene.id)
    $synth.SetOutputToWaveFile($path)
    $synth.Speak([string]$scene.narration)
    $synth.SetOutputToNull()
    Write-Output $path
}

$synth.Dispose()
