param([Parameter(Mandatory=$true)][string]$Directory,[ValidateSet('protect','verify')][string]$Mode='verify')
$ErrorActionPreference='Stop'
try {
 $currentSid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User
 $systemSid=New-Object System.Security.Principal.SecurityIdentifier('S-1-5-18')
 $item=Get-Item -LiteralPath $Directory -Force
 if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Control path must not be a reparse point' }
 $acl=Get-Acl -LiteralPath $Directory
 if ($acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $currentSid.Value) { throw 'Control path owner mismatch' }
 if ($Mode -eq 'protect') {
  if (-not $item.PSIsContainer) { throw 'Only the private control directory can be protected' }
  $icacls=Join-Path $env:SystemRoot 'System32\icacls.exe'
  & $icacls $Directory '/grant:r' ('*'+$currentSid.Value+':(OI)(CI)F') '*S-1-5-18:(OI)(CI)F' '/inheritance:r' '/Q' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Private ACL update failed' }
  $acl=Get-Acl -LiteralPath $Directory
 }
 $rules=$acl.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier])
 $selfAllowed=$false
 foreach ($rule in $rules) {
  if ($rule.AccessControlType -ne 'Allow') { throw 'Unexpected deny rule' }
  if ($rule.IdentityReference.Value -notin @($currentSid.Value,$systemSid.Value)) { throw 'Control path accessible to another principal' }
  if ($rule.IdentityReference.Value -eq $currentSid.Value -and ($rule.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -eq [System.Security.AccessControl.FileSystemRights]::FullControl) { $selfAllowed=$true }
 }
 if (-not $selfAllowed) { throw 'Current user permission missing' }
 if ($item.PSIsContainer -and -not $acl.AreAccessRulesProtected) { throw 'Control directory still inherits permissions' }
 Write-Output 'Private ACL verified'
} catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }
