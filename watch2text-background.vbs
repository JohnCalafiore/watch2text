' Runs Watch2Text with no window. Used by autostart; safe to double-click too.
' Logs go to watch2text.log in this folder.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = fso.GetParentFolderName(WScript.ScriptFullName)
sh.Run "cmd /c (if not exist .next\BUILD_ID call npm run build) & npx next start -p 3005 -H 127.0.0.1 > watch2text.log 2>&1", 0, False
