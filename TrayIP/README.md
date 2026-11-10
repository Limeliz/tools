# TrayIP

A small tray app for Windows 10/11 that shows your **LAN** and **WAN (public)** IP addresses
and notifies you when one of them changes.

It is a single PowerShell script with no installer and no dependencies. It runs on the
Windows PowerShell 5.1 that ships with Windows, and on PowerShell 7.

## Features

- A tray icon labelled **IP**. Its colour shows the connection state:
  - 🟩 green: LAN and internet are up
  - 🟧 orange: LAN is up but the internet can't be reached
  - ⬜ grey: no active network adapter
  - 🟦 blue: starting up / checking
- **Hover** the icon to see the WAN IP and the IP of each adapter.
- **Left- or right-click** to open the full list:
  - the WAN (public) IP
  - each active adapter (Ethernet, Wi-Fi, mobile, VPN, ...) with its type, link speed, IP(s) and gateway
  - click any address to copy it
  - *Copy all*, *Refresh now*, *Show change history*, *Start with Windows*, *Exit*
- **Notifications** (Windows toast) when:
  - an adapter's IP changes
  - an adapter connects or disconnects (for example, plugging in a cable or joining Wi-Fi)
  - the public WAN IP changes
  - the internet goes offline or comes back
- Every change is logged to `%LOCALAPPDATA%\TrayIP\history.log`.

## Usage

1. Copy the `TrayIP` folder somewhere permanent, for example `C:\Tools\TrayIP`.
2. If you downloaded the files, unblock them once (PowerShell):
   ```powershell
   Get-ChildItem C:\Tools\TrayIP | Unblock-File
   ```
3. Double-click **`TrayIP.vbs`** to start it without a console window.
4. Windows 11 hides new tray icons in the overflow (`^`) by default. To keep it visible, go to
   **Settings → Personalization → Taskbar → Other system tray icons** and turn on
   *Windows PowerShell*, or drag the icon from the overflow onto the taskbar.
5. To start it automatically at login, open the menu and tick **Start with Windows**.
   This adds an entry under `HKCU\...\CurrentVersion\Run`; untick it to remove the entry.

You can also run it directly:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File .\TrayIP.ps1
```

> Notifications come from "Windows PowerShell". If you don't see them, check
> **Settings → System → Notifications** and make sure notifications are on and
> Do Not Disturb is off.

## Settings

The settings are at the top of `TrayIP.ps1`:

| Setting | Default | Meaning |
|---|---|---|
| `$LanCheckSeconds` | `3` | How often the local adapters are checked |
| `$WanCheckSeconds` | `120` | How often the public IP is looked up. It is also re-checked a few seconds after any LAN change. |
| `$ShowIPv6` | `$false` | Also show global IPv6 addresses |
| `$NotifyOnOffline` | `$true` | Notify when the internet goes down or comes back |
| `$HideVirtualAdapters` | `$true` | Hide Hyper-V, WSL, VMware and VirtualBox adapters |
| `$IgnoreAdapterRegex` | `''` | Extra adapters to hide, for example `'Bluetooth\|Tailscale'` |
| `$WanLookupUrls` | ipify, icanhazip, AWS | Services used to find the public IP, tried in order |

## Notes

- The WAN IP is fetched over HTTPS in a background runspace, so the tray never freezes.
  A lookup must fail twice in a row before it counts as "offline", so a short hiccup
  while switching networks doesn't trigger a notification.
- Self-assigned addresses (`169.254.x.x`) are ignored, because they mean the adapter has
  no real connection.
- Only one copy runs at a time.
