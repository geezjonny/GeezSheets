Option Explicit
Dim journalShell, journalFiles, journalFolder, journalCommand
Set journalShell = CreateObject("WScript.Shell")
Set journalFiles = CreateObject("Scripting.FileSystemObject")
journalFolder = journalFiles.GetParentFolderName(WScript.ScriptFullName)
journalCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & journalFolder & "\open-journal.ps1"""
journalShell.Run journalCommand, 0, False
