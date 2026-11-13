$ErrorActionPreference = 'Stop'
try {
    $journalRoot = $PSScriptRoot
    $journalPort = 8765
    if ($env:PORT) { $journalPort = [int]$env:PORT }
    if ($journalPort -lt 1024 -or $journalPort -gt 65535) { throw 'Invalid journal port.' }
    $journalUrl = 'http://127.0.0.1:' + $journalPort
    function Test-JournalReady {
        try {
            $journalState = Invoke-RestMethod -Uri ($journalUrl + '/api/state') -TimeoutSec 2
            return ($null -ne $journalState.characters -and $null -ne $journalState.csrf)
        } catch { return $false }
    }
    if (-not (Test-JournalReady)) {
        $journalNode = (Get-Command node.exe -ErrorAction Stop).Source
        $journalLogs = Join-Path $journalRoot 'data'
        New-Item -ItemType Directory -Path $journalLogs -Force | Out-Null
        Start-Process -FilePath $journalNode -ArgumentList 'server.mjs' -WorkingDirectory $journalRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $journalLogs 'server.log') -RedirectStandardError (Join-Path $journalLogs 'server-error.log') | Out-Null
        $journalReady = $false
        for ($journalAttempt = 0; $journalAttempt -lt 30; $journalAttempt++) {
            if (Test-JournalReady) { $journalReady = $true; break }
            Start-Sleep -Milliseconds 300
        }
        if (-not $journalReady) { throw ('Journal could not start. Check ' + (Join-Path $journalLogs 'server-error.log')) }
    }
    $journalBrowsers = @(
        'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
        'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
        'C:\Program Files\Google\Chrome\Application\chrome.exe',
        'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe'
    )
    $journalBrowser = $journalBrowsers | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if ($journalBrowser) {
        Start-Process -FilePath $journalBrowser -ArgumentList @("--app=$journalUrl", '--window-size=940,800', '--window-position=160,80', '--no-first-run') | Out-Null
    } else {
        Start-Process $journalUrl | Out-Null
    }
} catch {
    $journalPopup = New-Object -ComObject WScript.Shell
    $journalPopup.Popup($_.Exception.Message, 0, 'Compendium Journal', 16) | Out-Null
    exit 1
}
