<#
.SYNOPSIS
    TrayIP - shows your LAN and WAN IP addresses in the Windows notification
    area (system tray) and pops up a notification whenever one of them changes.

.DESCRIPTION
    * Every active network adapter (Ethernet, Wi-Fi, USB tethering, VPN, ...)
      is listed with its own IPv4 address(es).
    * The public WAN address is looked up over HTTPS in the background.
    * Hover the tray icon to see a summary, left- or right-click it for the
      full list. Click an address in the menu to copy it to the clipboard.
    * A Windows notification is shown when a LAN or WAN address changes,
      when an adapter connects/disconnects, and when the internet goes
      offline/comes back.
    * Changes are also written to %LOCALAPPDATA%\TrayIP\history.log.

    Start it with TrayIP.vbs (no console window) or:
        powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File TrayIP.ps1

    Works with Windows PowerShell 5.1 (built into Windows 10/11) and PowerShell 7+.
#>

# ----------------------------------------------------------------------------
# Settings
# ----------------------------------------------------------------------------
$LanCheckSeconds      = 3      # how often local adapters are checked (cheap)
$WanCheckSeconds      = 120    # how often the public IP is looked up
$ShowIPv6             = $false # also show global IPv6 addresses on adapters
$NotifyOnOffline      = $true  # notify when the internet goes away / comes back
$HideVirtualAdapters  = $true  # hide Hyper-V / WSL / VMware / VirtualBox adapters
$VirtualAdapterRegex  = 'Hyper-V|vEthernet|WSL|VMware|VirtualBox|Npcap Loopback'
$IgnoreAdapterRegex   = ''     # extra adapters to hide, e.g. 'Bluetooth|Tailscale'
$WanLookupUrls        = @(     # tried in order until one answers (IPv4 only)
    'https://api.ipify.org',
    'https://ipv4.icanhazip.com',
    'https://checkip.amazonaws.com'
)

# ----------------------------------------------------------------------------
# Setup
# ----------------------------------------------------------------------------
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Only one instance at a time.
$createdNew = $false
$script:mutex = New-Object System.Threading.Mutex($true, 'Local\TrayIP_SingleInstance', [ref]$createdNew)
if (-not $createdNew) {
    [System.Windows.Forms.MessageBox]::Show('TrayIP is already running - look for the "IP" icon in the system tray (you may need to click the ^ arrow).', 'TrayIP') | Out-Null
    exit
}

# Make sure TLS 1.2 is available for the WAN lookup on Windows PowerShell 5.1.
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch { }

[System.Windows.Forms.Application]::EnableVisualStyles()

$script:AppName    = 'TrayIP'
$script:ScriptPath = $MyInvocation.MyCommand.Path
$script:ScriptDir  = Split-Path -Parent $script:ScriptPath
$script:DataDir    = Join-Path $env:LOCALAPPDATA 'TrayIP'
$script:LogFile    = Join-Path $script:DataDir 'history.log'
$script:RunKey     = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
if (-not (Test-Path $script:DataDir)) { New-Item -ItemType Directory -Path $script:DataDir | Out-Null }

# Current state
$script:Lan             = @()     # list of adapter objects
$script:LanSnapshot     = @{}     # adapter name -> "ip1, ip2"
$script:Wan             = $null   # public IP string or $null
$script:WanState        = 'unknown' # unknown | online | offline
$script:WanFailures     = 0
$script:WanLastChecked  = $null
$script:WanPS           = $null   # background PowerShell doing the lookup
$script:WanHandle       = $null
$script:WanStarted      = $null
$script:NextWanCheck    = [DateTime]::Now
$script:NextLanCheck    = [DateTime]::Now
$script:FirstRun        = $true
$script:LastUiSig       = ''
$script:CheckedItem     = $null

# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------
function Write-History([string]$text) {
    try {
        $line = '{0:yyyy-MM-dd HH:mm:ss}  {1}' -f (Get-Date), ($text -replace "`r?`n", ' | ')
        Add-Content -Path $script:LogFile -Value $line -Encoding UTF8
    } catch { }
}

function New-TrayIcon([System.Drawing.Color]$color) {
    $size = 32
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.Clear([System.Drawing.Color]::Transparent)

    # Rounded square background
    $r = 8
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc(0, 0, $r * 2, $r * 2, 180, 90)
    $path.AddArc($size - 1 - $r * 2, 0, $r * 2, $r * 2, 270, 90)
    $path.AddArc($size - 1 - $r * 2, $size - 1 - $r * 2, $r * 2, $r * 2, 0, 90)
    $path.AddArc(0, $size - 1 - $r * 2, $r * 2, $r * 2, 90, 90)
    $path.CloseFigure()
    $brush = New-Object System.Drawing.SolidBrush($color)
    $g.FillPath($brush, $path)

    # "IP" text
    $font = New-Object System.Drawing.Font('Segoe UI', 15, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment     = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rect = New-Object System.Drawing.RectangleF(0, 1, $size, $size)
    $g.DrawString('IP', $font, [System.Drawing.Brushes]::White, $rect, $sf)

    $g.Dispose(); $brush.Dispose(); $font.Dispose(); $path.Dispose()
    $icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
    return $icon
}

# Pre-build the three icons so we never leak icon handles.
$script:Icons = @{
    online  = New-TrayIcon ([System.Drawing.Color]::FromArgb(255, 16, 124, 16))   # green: LAN + WAN
    lanonly = New-TrayIcon ([System.Drawing.Color]::FromArgb(255, 202, 80, 16))   # orange: LAN but no internet
    offline = New-TrayIcon ([System.Drawing.Color]::FromArgb(255, 110, 110, 110)) # grey: no network
    unknown = New-TrayIcon ([System.Drawing.Color]::FromArgb(255, 0, 95, 184))    # blue: starting up
}

function Get-AdapterTypeLabel($nic) {
    switch ($nic.NetworkInterfaceType.ToString()) {
        'Ethernet'        { 'Ethernet' }
        'GigabitEthernet' { 'Ethernet' }
        'FastEthernetT'   { 'Ethernet' }
        'FastEthernetFx'  { 'Ethernet' }
        'Wireless80211'   { 'Wi-Fi' }
        'Wwanpp'          { 'Mobile' }
        'Wwanpp2'         { 'Mobile' }
        'Ppp'             { 'VPN/PPP' }
        'Tunnel'          { 'Tunnel' }
        default           { $_ }
    }
}

function Get-LanAdapters {
    $result = @()
    foreach ($nic in [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) {
        if ($nic.OperationalStatus -ne [System.Net.NetworkInformation.OperationalStatus]::Up) { continue }
        if ($nic.NetworkInterfaceType -eq [System.Net.NetworkInformation.NetworkInterfaceType]::Loopback) { continue }
        $ident = "$($nic.Name) $($nic.Description)"
        if ($HideVirtualAdapters -and $VirtualAdapterRegex -and $ident -match $VirtualAdapterRegex) { continue }
        if ($IgnoreAdapterRegex -and $ident -match $IgnoreAdapterRegex) { continue }

        $props = $nic.GetIPProperties()
        $addrs = @()
        foreach ($ua in $props.UnicastAddresses) {
            $a = $ua.Address
            if ($a.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork) {
                $s = $a.ToString()
                if ($s.StartsWith('169.254.')) { continue }   # APIPA = no DHCP answer
                $addrs += $s
            }
            elseif ($ShowIPv6 -and $a.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetworkV6) {
                if ($a.IsIPv6LinkLocal -or $a.IsIPv6SiteLocal -or $a.IsIPv6Multicast) { continue }
                # skip temporary/privacy addresses to avoid constant "changes"
                try { if ($ua.SuffixOrigin -eq [System.Net.NetworkInformation.SuffixOrigin]::Random) { continue } } catch { }
                $addrs += ($a.ToString() -replace '%\d+$', '')
            }
        }
        if ($addrs.Count -eq 0) { continue }

        $gw = @($props.GatewayAddresses | Where-Object {
                $_.Address.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and
                $_.Address.ToString() -ne '0.0.0.0' } | ForEach-Object { $_.Address.ToString() })

        $result += [pscustomobject]@{
            Name        = $nic.Name
            Type        = Get-AdapterTypeLabel $nic
            Description = $nic.Description
            Addresses   = $addrs
            Gateway     = ($gw -join ', ')
            Speed       = $nic.Speed
        }
    }
    # Physical-ish adapters first, then by name
    $order = @{ 'Ethernet' = 0; 'Wi-Fi' = 1; 'Mobile' = 2 }
    return @($result | Sort-Object @{ Expression = { if ($order.ContainsKey($_.Type)) { $order[$_.Type] } else { 9 } } }, Name)
}

function Format-Speed([long]$bps) {
    if ($bps -le 0) { return '' }
    if ($bps -ge 1000000000) { return ('{0:0.#} Gbps' -f ($bps / 1e9)) }
    return ('{0:0} Mbps' -f ($bps / 1e6))
}

# ----------------------------------------------------------------------------
# WAN lookup (runs in a background runspace so the tray never freezes)
# ----------------------------------------------------------------------------
$script:WanLookupScript = {
    param([string[]]$Urls)
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    } catch { }
    foreach ($u in $Urls) {
        try {
            $req = [System.Net.HttpWebRequest]::Create($u)
            $req.Timeout          = 6000
            $req.ReadWriteTimeout = 6000
            $req.UserAgent        = 'TrayIP'
            $req.Proxy            = [System.Net.WebRequest]::GetSystemWebProxy()
            $resp = $req.GetResponse()
            try {
                $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
                $text = $sr.ReadToEnd().Trim()
            } finally { $resp.Close() }
            if ($text -match '^\d{1,3}(\.\d{1,3}){3}$') { return $text }
        } catch { }
    }
    return $null
}

function Start-WanLookup {
    if ($script:WanPS) { return }   # already running
    $ps = [powershell]::Create()
    $null = $ps.AddScript($script:WanLookupScript.ToString()).AddArgument([string[]]$WanLookupUrls)
    $script:WanPS      = $ps
    $script:WanHandle  = $ps.BeginInvoke()
    $script:WanStarted = [DateTime]::Now
}

function Complete-WanLookup {
    # Returns $true if a lookup finished (successfully or not) during this call.
    if (-not $script:WanPS) { return $false }
    $result = $null
    if ($script:WanHandle.IsCompleted) {
        try {
            $out = $script:WanPS.EndInvoke($script:WanHandle)
            if ($out -and $out.Count -gt 0 -and $out[0]) { $result = [string]$out[0] }
        } catch { }
    }
    elseif (([DateTime]::Now - $script:WanStarted).TotalSeconds -gt 30) {
        try { $script:WanPS.Stop() } catch { }
    }
    else {
        return $false   # still running
    }
    try { $script:WanPS.Dispose() } catch { }
    $script:WanPS = $null
    $script:WanHandle = $null
    $script:WanLastChecked = [DateTime]::Now
    Update-Wan $result
    return $true
}

function Update-Wan($newIp) {
    $changes = @()
    if ($newIp) {
        $script:WanFailures = 0
        if ($script:WanState -eq 'offline' -and $NotifyOnOffline -and -not $script:FirstRun) {
            $changes += "Internet is back. WAN: $newIp"
        }
        elseif ($script:Wan -and $script:Wan -ne $newIp) {
            $changes += "WAN: $($script:Wan) -> $newIp"
        }
        $script:Wan = $newIp
        $script:WanState = 'online'
    }
    else {
        $script:WanFailures++
        # Require two failed lookups in a row before calling it offline,
        # so a short hiccup during a network switch is not reported.
        if ($script:WanFailures -ge 2 -or $script:Lan.Count -eq 0) {
            if ($script:WanState -eq 'online' -and $NotifyOnOffline) {
                $changes += "Internet unreachable (WAN was $($script:Wan))"
            }
            $script:WanState = 'offline'
            $script:Wan = $null
        }
        else {
            # retry soon
            $script:NextWanCheck = [DateTime]::Now.AddSeconds(10)
        }
    }
    if ($changes.Count -gt 0) { Send-ChangeNotification $changes }
    $null = Update-Ui
}

# ----------------------------------------------------------------------------
# LAN change detection
# ----------------------------------------------------------------------------
function Update-Lan {
    $adapters = Get-LanAdapters
    $snap = @{}
    foreach ($a in $adapters) { $snap[$a.Name] = ($a.Addresses -join ', ') }

    $changes = @()
    if (-not $script:FirstRun) {
        foreach ($name in $snap.Keys) {
            if (-not $script:LanSnapshot.ContainsKey($name)) {
                $changes += "$name connected: $($snap[$name])"
            }
            elseif ($script:LanSnapshot[$name] -ne $snap[$name]) {
                $changes += "${name}: $($script:LanSnapshot[$name]) -> $($snap[$name])"
            }
        }
        foreach ($name in $script:LanSnapshot.Keys) {
            if (-not $snap.ContainsKey($name)) {
                $changes += "$name disconnected (was $($script:LanSnapshot[$name]))"
            }
        }
    }

    $script:Lan = $adapters
    $script:LanSnapshot = $snap

    if ($changes.Count -gt 0) {
        Send-ChangeNotification $changes
        # The public IP often changes together with the local one: re-check soon.
        $script:NextWanCheck = [DateTime]::Now.AddSeconds(3)
        $script:WanFailures = 0
        $null = Update-Ui
    }
    return ($changes.Count -gt 0)
}

function Send-ChangeNotification([string[]]$changes) {
    $msg = $changes -join "`n"
    Write-History $msg
    if ($msg.Length -gt 250) { $msg = $msg.Substring(0, 247) + '...' }
    $script:Notify.ShowBalloonTip(5000, 'IP address changed', $msg, [System.Windows.Forms.ToolTipIcon]::Info)
}

# ----------------------------------------------------------------------------
# UI
# ----------------------------------------------------------------------------
function Set-TrayText([System.Windows.Forms.NotifyIcon]$ni, [string]$text) {
    # Windows allows 127 chars in a tray tooltip, but .NET Framework's
    # NotifyIcon.Text refuses more than 63. Work around it via reflection.
    if ($text.Length -gt 127) { $text = $text.Substring(0, 124) + '...' }
    try { $ni.Text = $text; return } catch { }
    try {
        $t = [System.Windows.Forms.NotifyIcon]
        $flags = [System.Reflection.BindingFlags]'NonPublic,Instance'
        $f = $t.GetField('text', $flags); if (-not $f) { $f = $t.GetField('_text', $flags) }
        $added = $t.GetField('added', $flags); if (-not $added) { $added = $t.GetField('_added', $flags) }
        $f.SetValue($ni, $text)
        if ($added.GetValue($ni)) { [void]$t.GetMethod('UpdateIcon', $flags).Invoke($ni, @($true)) }
    } catch {
        $ni.Text = $text.Substring(0, [Math]::Min(63, $text.Length))
    }
}

function Copy-Text([string]$text) {
    try { [System.Windows.Forms.Clipboard]::SetText($text) } catch { }
}

function Get-SummaryText {
    $lines = @()
    if ($script:Wan) { $lines += "WAN: $($script:Wan)" }
    elseif ($script:WanState -eq 'offline') { $lines += 'WAN: offline' }
    else { $lines += 'WAN: checking...' }
    foreach ($a in $script:Lan) { $lines += "$($a.Name): $($a.Addresses -join ', ')" }
    if ($script:Lan.Count -eq 0) { $lines += 'LAN: no network' }
    return ($lines -join "`r`n")
}

function Test-Autostart {
    try { return [bool](Get-ItemProperty -Path $script:RunKey -Name $script:AppName -ErrorAction Stop) } catch { return $false }
}

function Set-Autostart([bool]$enable) {
    if ($enable) {
        $vbs = Join-Path $script:ScriptDir 'TrayIP.vbs'
        if (Test-Path $vbs) {
            $cmd = "wscript.exe `"$vbs`""
        } else {
            $cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File `"$($script:ScriptPath)`""
        }
        Set-ItemProperty -Path $script:RunKey -Name $script:AppName -Value $cmd
    } else {
        Remove-ItemProperty -Path $script:RunKey -Name $script:AppName -ErrorAction SilentlyContinue
    }
}

function Add-MenuItem($menu, [string]$text, [scriptblock]$onClick, [bool]$bold = $false, [bool]$enabled = $true) {
    $item = New-Object System.Windows.Forms.ToolStripMenuItem($text)
    if ($bold) { $item.Font = New-Object System.Drawing.Font($item.Font, [System.Drawing.FontStyle]::Bold) }
    $item.Enabled = $enabled
    if ($onClick) { $item.add_Click($onClick) }
    [void]$menu.Items.Add($item)
    return $item
}

function Add-CopyItem($menu, [string]$label, [string]$value) {
    $item = New-Object System.Windows.Forms.ToolStripMenuItem("$label`t$value")
    $item.Tag = $value
    $item.ToolTipText = 'Click to copy'
    $item.add_Click({ param($s, $e) Copy-Text ([string]$s.Tag) })
    [void]$menu.Items.Add($item)
}

function Update-Menu {
    $menu = $script:Menu
    $menu.SuspendLayout()
    # Dispose old items
    $old = @($menu.Items)
    $menu.Items.Clear()
    foreach ($i in $old) { $i.Dispose() }

    # --- WAN ---
    [void](Add-MenuItem $menu 'WAN (public)' $null $true $false)
    if ($script:Wan) { Add-CopyItem $menu '    Internet' $script:Wan }
    elseif ($script:WanState -eq 'offline') { [void](Add-MenuItem $menu '    offline / unreachable' $null $false $false) }
    else { [void](Add-MenuItem $menu '    checking...' $null $false $false) }

    [void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))

    # --- LAN ---
    [void](Add-MenuItem $menu 'LAN (local)' $null $true $false)
    if ($script:Lan.Count -eq 0) {
        [void](Add-MenuItem $menu '    no active network adapter' $null $false $false)
    }
    foreach ($a in $script:Lan) {
        $hdr = "    $($a.Name)  [$($a.Type)]"
        $spd = Format-Speed $a.Speed
        if ($spd) { $hdr += "  $spd" }
        $h = Add-MenuItem $menu $hdr $null $false $false
        $h.ToolTipText = $a.Description
        foreach ($ip in $a.Addresses) { Add-CopyItem $menu '        IP' $ip }
        if ($a.Gateway) { Add-CopyItem $menu '        Gateway' $a.Gateway }
    }

    [void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))

    $script:CheckedItem = Add-MenuItem $menu 'WAN not checked yet' $null $false $false
    Update-CheckedLabel
    [void](Add-MenuItem $menu 'Copy all' { Copy-Text (Get-SummaryText) })
    [void](Add-MenuItem $menu 'Refresh now' {
            [void](Update-Lan)
            $script:NextWanCheck = [DateTime]::Now
            Update-Ui
        })
    [void](Add-MenuItem $menu 'Show change history' {
            if (-not (Test-Path $script:LogFile)) { Write-History 'History log created' }
            Start-Process notepad.exe -ArgumentList "`"$($script:LogFile)`""
        })
    $auto = Add-MenuItem $menu 'Start with Windows' {
        param($s, $e)
        Set-Autostart (-not (Test-Autostart))
        $s.Checked = Test-Autostart
    }
    $auto.Checked = Test-Autostart

    [void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))
    [void](Add-MenuItem $menu 'Exit' { $script:Notify.Visible = $false; [System.Windows.Forms.Application]::Exit() })

    $menu.ResumeLayout()
}

function Update-CheckedLabel {
    if ($script:CheckedItem -and $script:WanLastChecked) {
        $script:CheckedItem.Text = 'WAN checked {0:HH:mm:ss}' -f $script:WanLastChecked
    }
}

function Update-Ui {
    # Icon colour
    if ($script:Lan.Count -eq 0)          { $state = 'offline' }
    elseif ($script:WanState -eq 'online') { $state = 'online' }
    elseif ($script:WanState -eq 'offline'){ $state = 'lanonly' }
    else                                   { $state = 'unknown' }
    $script:Notify.Icon = $script:Icons[$state]

    # Tooltip: keep it compact - Windows truncates at 127 characters.
    $lines = @()
    if ($script:Wan) { $lines += "WAN  $($script:Wan)" }
    elseif ($script:WanState -eq 'offline') { $lines += 'WAN  offline' }
    else { $lines += 'WAN  checking...' }
    foreach ($a in $script:Lan) { $lines += "$($a.Name)  $($a.Addresses[0])" }
    if ($script:Lan.Count -eq 0) { $lines += 'No network' }
    $tip = $lines -join "`n"

    # Only rebuild the menu when something actually changed, so an open
    # menu does not close/flicker on every background check.
    $sig = "$state|$(Get-SummaryText)|" + (($script:Lan | ForEach-Object { "$($_.Gateway)/$($_.Speed)" }) -join ';')
    if ($sig -ne $script:LastUiSig) {
        $script:LastUiSig = $sig
        Set-TrayText $script:Notify $tip
        Update-Menu
    } else {
        Update-CheckedLabel
    }
}

# ----------------------------------------------------------------------------
# Build tray icon
# ----------------------------------------------------------------------------
$script:Menu = New-Object System.Windows.Forms.ContextMenuStrip
$script:Menu.ShowItemToolTips = $true

$script:Notify = New-Object System.Windows.Forms.NotifyIcon
$script:Notify.Icon = $script:Icons['unknown']
$script:Notify.Text = 'TrayIP - starting...'
$script:Notify.ContextMenuStrip = $script:Menu
$script:Notify.Visible = $true

# Left click shows the same menu as right click.
$script:Notify.add_MouseUp({
        param($s, $e)
        if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) {
            $m = [System.Windows.Forms.NotifyIcon].GetMethod('ShowContextMenu', [System.Reflection.BindingFlags]'NonPublic,Instance')
            if ($m) { [void]$m.Invoke($script:Notify, $null) }
        }
    })

# Clicking a notification copies the summary.
$script:Notify.add_BalloonTipClicked({ Copy-Text (Get-SummaryText) })

# ----------------------------------------------------------------------------
# Main loop (WinForms timer runs on the UI thread)
# ----------------------------------------------------------------------------
$script:Timer = New-Object System.Windows.Forms.Timer
$script:Timer.Interval = 1000
$script:Timer.add_Tick({
        try {
            $now = [DateTime]::Now
            if ($now -ge $script:NextLanCheck) {
                $script:NextLanCheck = $now.AddSeconds($LanCheckSeconds)
                [void](Update-Lan)
            }
            if (-not $script:WanPS -and $now -ge $script:NextWanCheck) {
                $script:NextWanCheck = $now.AddSeconds($WanCheckSeconds)
                Start-WanLookup
            }
            if ($script:WanPS) {
                if (Complete-WanLookup) { $script:FirstRun = $false }
            }
        } catch {
            Write-History "Error: $($_.Exception.Message)"
        }
    })

# Initial state
[void](Update-Lan)
Update-Ui
Write-History ("Started. " + ((Get-SummaryText) -replace "`r`n", ' | '))
$script:Timer.Start()

try {
    [System.Windows.Forms.Application]::Run()
} finally {
    $script:Timer.Stop()
    $script:Notify.Visible = $false
    $script:Notify.Dispose()
    if ($script:WanPS) { try { $script:WanPS.Stop(); $script:WanPS.Dispose() } catch { } }
    try { $script:mutex.ReleaseMutex() } catch { }
}
