param([string]$ProfileDir)

Add-Type -Name Win -Namespace Api -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
[DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
'@

for ($i = 0; $i -lt 60; $i++) {
    $list = Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like "*$ProfileDir*" }
    foreach ($item in $list) {
        $proc = Get-Process -Id $item.ProcessId -ErrorAction SilentlyContinue
        if ($proc -and $proc.MainWindowHandle -ne 0) {
            [Api.Win]::ShowWindow($proc.MainWindowHandle, 9) | Out-Null
            [Api.Win]::BringWindowToTop($proc.MainWindowHandle) | Out-Null
            [Api.Win]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
            exit 0
        }
    }
    Start-Sleep -Milliseconds 250
}
exit 1
