' Starts TrayIP.ps1 without showing a console window.
' Double-click this file to start TrayIP.
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File """ & dir & "\TrayIP.ps1"""
CreateObject("WScript.Shell").Run cmd, 0, False
