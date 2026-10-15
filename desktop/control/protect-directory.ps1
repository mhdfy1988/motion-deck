param([Parameter(Mandatory=$true)][string]$Directory,[ValidateSet('protect','seal-file','verify')][string]$Mode='verify')
$ErrorActionPreference='Stop'
function Assert-PrivateAcl($item,$acl,$currentSid,$systemSid) {
 if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Control path must not be a reparse point' }
 $ownerSid=$acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value
 if ($ownerSid -ne $currentSid.Value) { throw "Control path owner mismatch (owner=$ownerSid; current=$($currentSid.Value))" }
 $selfAllowed=$false
 foreach ($rule in $acl.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier])) {
  if ($rule.AccessControlType -ne 'Allow') { throw 'Unexpected deny rule' }
  if ($rule.IdentityReference.Value -notin @($currentSid.Value,$systemSid.Value)) { throw "Control path accessible to another principal (sid=$($rule.IdentityReference.Value); inherited=$($rule.IsInherited); rights=$($rule.FileSystemRights))" }
  if ($rule.IdentityReference.Value -eq $currentSid.Value -and ($rule.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -eq [System.Security.AccessControl.FileSystemRights]::FullControl) { $selfAllowed=$true }
 }
 if (-not $selfAllowed) { throw 'Current user permission missing' }
 if ($item.PSIsContainer -and -not $acl.AreAccessRulesProtected) { throw 'Control directory still inherits permissions' }
}
try {
 $identity=[System.Security.Principal.WindowsIdentity]::GetCurrent()
 $currentSid=$identity.User
 $systemSid=New-Object System.Security.Principal.SecurityIdentifier('S-1-5-18')
 $item=Get-Item -LiteralPath $Directory -Force
 if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Control path must not be a reparse point' }
 $acl=Get-Acl -LiteralPath $Directory
 if ($Mode -eq 'protect' -and -not $item.PSIsContainer) { throw 'Only the private control directory can be protected' }
 if ($Mode -eq 'seal-file') {
  # 仅封存服务以wx创建的临时凭据；先核对其父目录已经私有化。
  if ($item.PSIsContainer -or $item.Name -notmatch '^instance-[a-f0-9-]{36}\.tmp$') { throw 'Only a new temporary credential can be sealed' }
  $parent=Get-Item -LiteralPath $item.DirectoryName -Force
  Assert-PrivateAcl $parent (Get-Acl -LiteralPath $parent.FullName) $currentSid $systemSid
 }
 $ownerSid=$acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value
 if ($ownerSid -ne $currentSid.Value) {
  # 提权令牌可默认以管理员组创建对象；只在显式初始化中归属当前账号。
  $principal=New-Object System.Security.Principal.WindowsPrincipal($identity)
  if ($Mode -eq 'verify' -or $ownerSid -ne 'S-1-5-32-544' -or -not $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) { throw "Control path owner mismatch (owner=$ownerSid; current=$($currentSid.Value); mode=$Mode)" }
  & (Join-Path $env:SystemRoot 'System32\icacls.exe') $Directory '/setowner' ('*'+$currentSid.Value) '/Q' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Private owner update failed' }
  $acl=Get-Acl -LiteralPath $Directory
 }
 if ($Mode -ne 'verify') {
  # 明确替换DACL，而非在继承/显式混合规则上逐项增删；不修改SACL或其他路径。
  if ($item.PSIsContainer) { $desired=New-Object System.Security.AccessControl.DirectorySecurity; $inherit='OICI' }
  else { $desired=New-Object System.Security.AccessControl.FileSecurity; $inherit='' }
  $desired.SetSecurityDescriptorSddlForm("D:P(A;$inherit;FA;;;$($currentSid.Value))(A;$inherit;FA;;;SY)",[System.Security.AccessControl.AccessControlSections]::Access)
  $item.SetAccessControl($desired)
  $acl=Get-Acl -LiteralPath $Directory
 }
 Assert-PrivateAcl $item $acl $currentSid $systemSid
 Write-Output 'Private ACL verified'
} catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }
