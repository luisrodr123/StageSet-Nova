# Run only on the disposable GitHub-hosted runner, never against a musician's installation.
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or -not $env:RUNNER_TEMP) { throw 'Este teste requer o Windows isolado do GitHub Actions.' }
$releaseVersion = (Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json).version
$runnerRoot = [IO.Path]::GetFullPath($env:RUNNER_TEMP)
$installFolder = [IO.Path]::GetFullPath((Join-Path $runnerRoot ('StageSet-test-' + [guid]::NewGuid())))
if (-not $installFolder.StartsWith($runnerRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Pasta de teste inválida.' }
$installer = (Resolve-Path -LiteralPath "dist/StageSet-$releaseVersion-Setup-x64.exe").Path
$installedProcess = Start-Process -FilePath $installer -ArgumentList @('/S', "/D=$installFolder") -PassThru -Wait -WindowStyle Hidden
if ($installedProcess.ExitCode -ne 0) { throw "Instalação falhou: $($installedProcess.ExitCode)" }
$executable = Join-Path $installFolder 'StageSet.exe'
if (-not (Test-Path -LiteralPath $executable)) { throw 'Executável instalado ausente.' }
$stageSetProcess = $null
try {
  $stageSetProcess = Start-Process -FilePath $executable -PassThru -WindowStyle Hidden
  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
      $response = Invoke-WebRequest -Uri 'http://127.0.0.1:4178/' -TimeoutSec 2
      $badge = 'v' + (($releaseVersion -split '\.')[0..1] -join '.')
      if ($response.Content.Contains($badge)) { $ready = $true; break }
    } catch { Start-Sleep -Milliseconds 500 }
  }
  if (-not $ready) { throw 'A aplicação instalada não iniciou com a versão esperada.' }
} finally {
  if ($stageSetProcess -and -not $stageSetProcess.HasExited) {
    if (-not $stageSetProcess.CloseMainWindow()) { Stop-Process -Id $stageSetProcess.Id -Force }
    if (-not $stageSetProcess.WaitForExit(10000)) { Stop-Process -Id $stageSetProcess.Id -Force }
  }
}
$uninstaller = Join-Path $installFolder 'Uninstall StageSet.exe'
if (-not (Test-Path -LiteralPath $uninstaller)) { throw 'Desinstalador ausente.' }
$removed = Start-Process -FilePath $uninstaller -ArgumentList '/S' -PassThru -Wait -WindowStyle Hidden
if ($removed.ExitCode -ne 0) { throw "Desinstalação falhou: $($removed.ExitCode)" }
for ($attempt = 0; $attempt -lt 30 -and (Test-Path -LiteralPath $executable); $attempt++) { Start-Sleep -Milliseconds 500 }
if (Test-Path -LiteralPath $executable) { throw 'A desinstalação deixou o executável instalado.' }
Write-Output "StageSet ${releaseVersion}: instalar, iniciar e desinstalar no Windows isolado: OK"
