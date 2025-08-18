# Script will restart XProtect Mobile Server and log current date to $path
# Run every night using Time Scheduler.

$path = "C:\Logs\MobileServer_LastRestart.txt"

Restart-Service -Name "Milestone XProtect Mobile Server" >> $path
Get-Date >> $path
