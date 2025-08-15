; Auto-Hotkey-script which will activate on CTRL+ALT+SHIFT+1 (map this to an extra button on your mouse). When
; activated it will type "admin", press tab and paste your clipboard and then press return. For when you often
; login to devices using a password from a passwordmanager and don't want to move your hand from the mouse to login.

; CTRL+ALT+SHIFT+1 or Press thumb on Logitech MX Masters S2 (button hotkeyed to CTRL+ALT+SHIFT+1 in Logi Options+)

^+!1::
Send, admin{Tab}
Send, ^v ; Paste
Send, {Enter}
return
