param([Parameter(Mandatory=$true)][string]$Target,[ValidateSet('inspect','admin-owner')][string]$Mode='inspect')
$ErrorActionPreference='Stop'
$resolved=(Resolve-Path -LiteralPath $Target).Path
$allowed=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\output'))+[IO.Path]::DirectorySeparatorChar
if (-not $resolved.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)) { throw 'Test path must stay inside project output' }
$identity=[System.Security.Principal.WindowsIdentity]::GetCurrent()
$principal=New-Object System.Security.Principal.WindowsPrincipal($identity)
$elevated=$principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
if ($Mode -eq 'admin-owner') {
 if (-not $elevated) { throw 'Owner fixture requires an elevated process' }
 & (Join-Path $env:SystemRoot 'System32\icacls.exe') $resolved '/setowner' '*S-1-5-32-544' '/Q' | Out-Null
 if ($LASTEXITCODE -ne 0) { throw 'Test owner update failed' }
}
$acl=Get-Acl -LiteralPath $resolved
@{current=$identity.User.Value;owner=$acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value;elevated=$elevated;rules=@($acl.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier]) | ForEach-Object { @{sid=$_.IdentityReference.Value;inherited=$_.IsInherited;rights=$_.FileSystemRights.ToString()} })} | ConvertTo-Json -Compress -Depth 4
