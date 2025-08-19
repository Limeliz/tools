Installs MilestonePSTools and sets up the enviroment
```Set-ExecutionPolicy RemoteSigned -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; Invoke-Expression (Invoke-RestMethod 'https://www.milestonepstools.com/install.ps1')```

Connects to localhost VMS
```Connect-Vms -AcceptEula```

Conencts to remote VMS
```Connect-Vms -ServerAddress http://10.46.6.6 -Credential (Get-Credential)```

Adds matching events to all cameras and then enabling the events.
```
Get-VmsCamera | Get-VmsDeviceEvent -Name '*ObjectAnalytics/Device*' | Set-VmsDeviceEvent -Used $true -Enabled $true
Get-VmsCamera | Get-VmsDeviceEvent -Name 'Device/IO/OutputPort*' | Set-VmsDeviceEvent -Used $true -Enabled $true
Get-VmsCamera | Get-VmsDeviceEvent -Name 'Object E*' | Set-VmsDeviceEvent -Used $true -Enabled $true
Get-VmsCamera | Get-VmsDeviceEvent -Name 'Tripwire' | Set-VmsDeviceEvent -Used $true -Enabled $true
Get-VmsCamera | Get-VmsDeviceEvent -Name 'Tampering' | Set-VmsDeviceEvent -Used $true -Enabled $true
Get-VmsCamera | Get-VmsDeviceEvent -Name 'Intrusion s*' | Set-VmsDeviceEvent -Used $true -Enabled $true
Get-VmsCamera | Get-VmsDeviceEvent -Name 'Video analytics event*' | Set-VmsDeviceEvent -Used $true -Enabled $true
Get-VmsCamera | Get-VmsDeviceEvent -Name 'Window tampering st*' | Set-VmsDeviceEvent -Used $true -Enabled $true
Get-VmsCamera | Get-VmsDeviceEvent -Name '*AXISImageHealthAnalytics*' | Set-VmsDeviceEvent -Used $true -Enabled $true
```

List all enabled cameras
```Get-VmsCamera```
Output:
```
Name  Channel Enabled LastModified        Id
----  ------- ------- ------------        --
CAM-1 0       True    2025-01-09 07:08:44 20C01392-7BD6-49B4-8DFB-D4580D55F035
CAM-2 0       True    2025-01-09 07:06:05 FDE22126-7591-4D4F-8910-8DA6F0F003FD
CAM-3 0       True    2025-01-09 07:06:06 AAB3418B-1783-492E-9BF0-FE87B226B7F3
CAM-4 0       True    2025-01-09 07:06:06 C2FBAA43-83D1-465C-9E90-7B747FD78809
CAM-5 0       True    2025-01-09 07:06:07 3AA37F5A-5CD0-4D80-9839-362E13A5BB03
```

List all hardware
```Get-VmsHardware```
Output:
```
Name  Address            Model                      Enabled LastModified        Id
----  -------            -----                      ------- ------------        --
CAM-1 http://10.46.6.21/ AXIS P3268-LVE Dome Camera True    2025-01-13 12:10:27 4F0DCB1E-770C-4574-95FD-429F9984CF93
CAM-3 http://10.46.6.23/ AXIS P3268-LVE Dome Camera True    2025-01-13 12:10:26 50030C3C-E130-4683-8CED-918E80540AF8
CAM-2 http://10.46.6.22/ AXIS P3268-LVE Dome Camera True    2025-01-13 12:10:26 5036BA74-5578-40DB-AC3F-47858D5CF266
CAM-4 http://10.46.6.24/ AXIS P3268-LVE Dome Camera True    2025-01-13 12:10:26 60E089D3-37D9-4C75-92FE-1360BC740771
CAM-5 http://10.46.6.25/ AXIS P3268-LVE Dome Camera True    2025-01-13 12:10:26 DCFFD903-729E-4AC1-8398-D5C77874780B
```

List recording server
```Get-RecordingServer```
Output:
```
Name  HostName WebServerUri       TimeZoneName            LastModified        Id
----  -------- ------------       ------------            ------------        --
S1-PC s1-pc    http://s1-pc:7563/ W. Europe Standard Time 2025-01-09 13:09:23 04A26435-416A-4FCF-A923-000CA347C245
```

List all device groups
```Get-VmsDeviceGroup```
Output:
```
DisplayName ItemCategory Path                                              ParentPath
----------- ------------ ----                                              ----------
Bygg        Item         CameraGroup[0ae1d7a5-9e3f-421b-b0cd-bf407fef7e1f] /CameraGroupFolder
```

List health events from CAM-1
```Get-VmsCamera -name 'CAM-1' | Get-VmsDeviceEvent -Name '*AXISImageHealthAnalytics*'```
Output:
```
CAM-1  AcapOnvifEvent/AXISImageHealthAnalytics/Any-Active-Events (Image Health Analytics - Any-Active-Events (Onvif)) Falling    True      True
CAM-1  AcapOnvifEvent/AXISImageHealthAnalytics/Any-Active-Events (Image Health Analytics - Any-Active-Events (Onvif)) Rising     True      True
CAM-1  AcapOnvifEvent/AXISImageHealthAnalytics/Block (Image Health Analytics - Block (Onvif)) Falling                            True      True
CAM-1  AcapOnvifEvent/AXISImageHealthAnalytics/Block (Image Health Analytics - Block (Onvif)) Rising                             True      True
CAM-1  AcapOnvifEvent/AXISImageHealthAnalytics/Blur (Image Health Analytics - Blur (Onvif)) Falling                              True      True
CAM-1  AcapOnvifEvent/AXISImageHealthAnalytics/Blur (Image Health Analytics - Blur (Onvif)) Rising                               True      True
CAM-1  AcapOnvifEvent/AXISImageHealthAnalytics/Redirect (Image Health Analytics - Redirect (Onvif)) Falling                      True      True
CAM-1  AcapOnvifEvent/AXISImageHealthAnalytics/Redirect (Image Health Analytics - Redirect (Onvif)) Rising                       True      True
CAM-1  AcapOnvifEvent/AXISImageHealthAnalytics/Under-Exposure (Image Health Analytics - Under-Exposure (Onvif)) Falling          True      True
CAM-1  AcapOnvifEvent/AXISImageHealthAnalytics/Under-Exposure (Image Health Analytics - Under-Exposure (Onvif)) Rising           True      True
CAM-1  AcapOnvifEvent/AXISImageHealthAnalytics/Unsuitability (Image Health Analytics - Unsuitability (Onvif)) Falling            True      True
CAM-1  AcapOnvifEvent/AXISImageHealthAnalytics/Unsuitability (Image Health Analytics - Unsuitability (Onvif)) Rising             True      True
CAM-1  CameraApplicationPlatform/AXISImageHealthAnalytics/Any-Active-Events (Image Health Analytics - Any-Active-Events) Falling True      True
CAM-1  CameraApplicationPlatform/AXISImageHealthAnalytics/Any-Active-Events (Image Health Analytics - Any-Active-Events) Rising  True      True
CAM-1  CameraApplicationPlatform/AXISImageHealthAnalytics/Block (Image Health Analytics - Block) Falling                         True      True
CAM-1  CameraApplicationPlatform/AXISImageHealthAnalytics/Block (Image Health Analytics - Block) Rising                          True      True
CAM-1  CameraApplicationPlatform/AXISImageHealthAnalytics/Blur (Image Health Analytics - Blur) Falling                           True      True
CAM-1  CameraApplicationPlatform/AXISImageHealthAnalytics/Blur (Image Health Analytics - Blur) Rising                            True      True
CAM-1  CameraApplicationPlatform/AXISImageHealthAnalytics/Redirect (Image Health Analytics - Redirect) Falling                   True      True
CAM-1  CameraApplicationPlatform/AXISImageHealthAnalytics/Redirect (Image Health Analytics - Redirect) Rising                    True      True
CAM-1  CameraApplicationPlatform/AXISImageHealthAnalytics/Under-Exposure (Image Health Analytics - Under-Exposure) Falling       True      True
CAM-1  CameraApplicationPlatform/AXISImageHealthAnalytics/Under-Exposure (Image Health Analytics - Under-Exposure) Rising        True      True
CAM-1  CameraApplicationPlatform/AXISImageHealthAnalytics/Unsuitability (Image Health Analytics - Unsuitability) Falling         True      True
CAM-1  CameraApplicationPlatform/AXISImageHealthAnalytics/Unsuitability (Image Health Analytics - Unsuitability) Rising          True      True
```

List all rules starting with "Err:", "OK:" and "Info:"
```Get-VmsRule | Where-Object{$_.DisplayName -clike 'Err:*' -or  $_.DisplayName -clike 'OK:*' -or  $_.DisplayName -clike 'Info:*'} | Sort-Object -Property DisplayName```
