# Registers the Print Agent as a Windows Task Scheduler task that starts
# automatically when the current Windows user logs in, and restarts it if
# it ever exits unexpectedly.
#
# Run as the CURRENT Windows user (not SYSTEM) - the DCR3 USB printer is
# installed in this user's own Windows printer session, and a SYSTEM-level
# task typically cannot see/use it.
#
# Usage (from an elevated or normal PowerShell prompt, inside print-agent\):
#   powershell -ExecutionPolicy Bypass -File .\install-task.ps1

$ErrorActionPreference = 'Stop'

$taskName = 'RestaurantPrintAgent'
$workDir = $PSScriptRoot
$nodePath = (Get-Command node -ErrorAction Stop).Source

Write-Host "Registering scheduled task '$taskName'..."
Write-Host "  Working directory: $workDir"
Write-Host "  Node.js: $nodePath"

$action = New-ScheduledTaskAction -Execute $nodePath -Argument 'agent.js' -WorkingDirectory $workDir
$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 0)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null

Write-Host "Task '$taskName' registered - it will start automatically at your next login."
Write-Host "To start it right now without logging out: Start-ScheduledTask -TaskName '$taskName'"
Write-Host ""
Write-Host "To remove it later:"
Write-Host "  Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false"
