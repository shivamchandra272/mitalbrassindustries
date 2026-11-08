$php = "C:\xampp\php\php.exe"
$resetScript = Join-Path $PSScriptRoot "reset-admin-password.php"

if (-not (Test-Path $php)) {
    Write-Error "XAMPP PHP was not found at $php. Update the PHP path in this file."
    Read-Host "Press Enter to close"
    exit 1
}

$securePassword = Read-Host "Enter a new admin password (at least 12 characters)" -AsSecureString
$passwordPointer = [IntPtr]::Zero

try {
    $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    $env:MBI_ADMIN_RESET_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    & $php $resetScript
    $exitCode = $LASTEXITCODE
} finally {
    Remove-Item Env:\MBI_ADMIN_RESET_PASSWORD -ErrorAction SilentlyContinue
    if ($passwordPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    }
    $securePassword.Dispose()
}

Read-Host "Press Enter to close"
exit $exitCode
