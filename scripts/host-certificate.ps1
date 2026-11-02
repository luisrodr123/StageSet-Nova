param([Parameter(Mandatory=$true)][string]$Address,[string]$OutputDirectory=(Join-Path $PSScriptRoot '../dist/host-certificate'),[Security.SecureString]$Password)
$ErrorActionPreference='Stop'
$parsed=$null
if(-not [System.Net.IPAddress]::TryParse($Address,[ref]$parsed) -or $parsed.AddressFamily -ne 'InterNetwork'){throw 'Indica o IPv4 local do PC StageSet.'}
$output=[IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $output -Force | Out-Null
$pfx=Join-Path $output 'StageSet-Host.pfx';$cer=Join-Path $output 'StageSet-Host-CA.cer'
if((Test-Path -LiteralPath $pfx) -or (Test-Path -LiteralPath $cer)){throw 'Já existem certificados nesta pasta. Escolhe outra pasta para não os substituir.'}
if($null -eq $Password){$Password=Read-Host 'Palavra-passe para proteger o PFX (necessária no StageSet)' -AsSecureString}
$ca=$null;$server=$null
try {
  $ca=New-SelfSignedCertificate -Type Custom -Subject 'CN=StageSet Host Local CA' -KeyAlgorithm RSA -KeyLength 3072 -HashAlgorithm SHA256 -KeyUsage CertSign,CRLSign -TextExtension @('2.5.29.19={critical}{text}ca=TRUE') -CertStoreLocation 'Cert:\CurrentUser\My' -NotAfter (Get-Date).AddYears(2)
  $server=New-SelfSignedCertificate -Type Custom -Subject 'CN=StageSet Host' -Signer $ca -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyUsage DigitalSignature,KeyEncipherment -TextExtension @("2.5.29.17={text}IPAddress=$Address&DNS=stageset.local",'2.5.29.37={text}1.3.6.1.5.5.7.3.1') -CertStoreLocation 'Cert:\CurrentUser\My' -NotAfter (Get-Date).AddMonths(12)
  Export-PfxCertificate -Cert $server -FilePath $pfx -Password $password | Out-Null
  Export-Certificate -Cert $ca -FilePath $cer | Out-Null
  Write-Output "PFX para o StageSet: $pfx"
  Write-Output "Certificado público para confiar nos teus recetores: $cer"
  Write-Output 'Nada foi instalado como autoridade de confiança. Não partilhes o PFX ou a palavra-passe.'
} finally {
  # Remove only the temporary certificates created by this invocation; never alter trust stores.
  foreach($created in @($server,$ca)){if($null -ne $created){Remove-Item -LiteralPath ('Cert:\CurrentUser\My\'+$created.Thumbprint) -DeleteKey}}
}
