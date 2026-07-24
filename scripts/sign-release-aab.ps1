# Google Play 업로드용 AAB를 기존 업로드 키로 서명하는 도구입니다.
$ErrorActionPreference = 'Stop'

$Root = Resolve-Path (Join-Path $PSScriptRoot '..')
$JavaHome = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot'
$Jarsigner = Join-Path $JavaHome 'bin\jarsigner.exe'
$SourceAab = Join-Path $Root 'android-twa\app-release-bundle-api36-v5.aab'
$SignedAab = Join-Path $Root 'android-twa\app-release-bundle-api36-v5-signed.aab'
$Keystore = Join-Path $Root 'android-twa\lottobank-release.keystore'
$Alias = 'lottobank'

function Convert-SecretToText {
  param([Security.SecureString] $Secret)
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secret)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

if (-not (Test-Path -LiteralPath $Jarsigner)) {
  throw "jarsigner.exe를 찾을 수 없습니다. JDK 경로를 확인하세요. $Jarsigner"
}

if (-not (Test-Path -LiteralPath $SourceAab)) {
  throw "서명할 AAB를 찾을 수 없습니다. $SourceAab"
}

if (-not (Test-Path -LiteralPath $Keystore)) {
  throw "업로드 키스토어를 찾을 수 없습니다. $Keystore"
}

Write-Host ''
Write-Host 'LottoBank AAB 서명을 시작합니다.' -ForegroundColor Cyan
Write-Host '키스토어 비밀번호를 물어보면 입력하세요. 키 비밀번호가 따로 있으면 추가로 물어봅니다.' -ForegroundColor Yellow
Write-Host ''

$StorePassword = Convert-SecretToText (Read-Host '키스토어 비밀번호' -AsSecureString)
$KeyPassword = $StorePassword

Copy-Item -LiteralPath $SourceAab -Destination $SignedAab -Force

try {
  & $Jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 -keystore $Keystore -storepass $StorePassword -keypass $KeyPassword $SignedAab $Alias
  if ($LASTEXITCODE -ne 0) {
    Write-Host ''
    Write-Host '키 비밀번호가 키스토어 비밀번호와 다를 수 있습니다.' -ForegroundColor Yellow
    $KeyPassword = Convert-SecretToText (Read-Host '키 비밀번호' -AsSecureString)
    Copy-Item -LiteralPath $SourceAab -Destination $SignedAab -Force
    & $Jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 -keystore $Keystore -storepass $StorePassword -keypass $KeyPassword $SignedAab $Alias
  }
  if ($LASTEXITCODE -ne 0) {
    throw "jarsigner 서명 실패. 종료 코드 $LASTEXITCODE"
  }

  Write-Host ''
  Write-Host '서명 검증을 시작합니다.' -ForegroundColor Cyan
  $verifyOutput = & $Jarsigner -verify -verbose -certs $SignedAab 2>&1
  $verifyOutput | ForEach-Object { Write-Host $_ }
  if ($LASTEXITCODE -ne 0 -or ($verifyOutput -join "`n") -match 'jar is unsigned') {
    throw "서명 검증 실패. signed AAB가 아직 unsigned 상태입니다."
  }
}
catch {
  if (Test-Path -LiteralPath $SignedAab) {
    Remove-Item -LiteralPath $SignedAab -Force
  }
  Write-Host ''
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host '비밀번호를 확인한 뒤 다시 실행하세요.' -ForegroundColor Yellow
  Read-Host '창을 닫으려면 Enter를 누르세요'
  exit 1
}

Write-Host ''
Write-Host "완료되었습니다. Play Console에는 아래 파일을 업로드하세요." -ForegroundColor Green
Write-Host $SignedAab -ForegroundColor Green
Write-Host ''
Read-Host '창을 닫으려면 Enter를 누르세요'
