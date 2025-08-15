# A powershell script which loops in the background, regularly checking if you're connected through
# Window native VPN. If you are it will popup and tell you which connection. Excellent when you kee
# forgetting to disconnect your VPN:s.

# Wait 15 minutes (1800 seconds) between each check
$Pause = 900

Write-Output "Looking for active VPN connections every $($Pause/60) minutes..."
while ($true) {
    # Get VPN connections with status 'Connected'
    $connectedVpns = Get-VpnConnection | Where-Object { $_.ConnectionStatus -eq 'Connected' }

    # If any connected VPN found, show a popup
    if ($connectedVpns) {
        $message = "Connected to VPN: " + ($connectedVpns | ForEach-Object { $_.Name }) -join ", "
		
        # Show a message box
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.MessageBox]::Show($message, "VPN Connected", 'OK', 'Information')

        # Play a simple system sound (Asterisk)
        [System.Media.SystemSounds]::Asterisk.Play()
    }
    
	Start-Sleep -Seconds $Pause
}
