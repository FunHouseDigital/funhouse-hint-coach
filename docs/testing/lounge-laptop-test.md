# Lounge laptop test

Write the results in `lounge-laptop-results.txt` (in the same folder).

## At the lounge laptop

1. Write down how much memory it has. Windows Settings, then System, then About.
2. Close every other program and browser tab.
3. Copy the USB pack folder onto the laptop and run it from there. Running it straight from the stick hasn't been tested.
4. Check the start file's fingerprint with `Get-FileHash ".\Start Hint Coach.cmd" -Algorithm SHA256` in PowerShell. It should end in ...ac22e.

   How to open PowerShell in the pack folder: open the copied usb-pack folder in File Explorer, click the address bar, type `powershell` and press Enter. (Or Shift + right-click in the folder, then "Open PowerShell window here".) The full value is `DFB4BFE04B707AA0344707BA661EB4B42617B49CEAD07FD6A81EE4D1C4DAC22E`.

5. Double-click Start Hint Coach.cmd. If a blue "Windows protected your PC" box appears, click More info, then Run anyway. If anything else blocks it, take a screenshot of the exact message and stop there.

## While it runs

6. Time how long it takes from opening the app to the model being ready. A stopwatch on your phone is fine.
7. Switch the Wi-Fi off, reload the page and do one robot exercise and one sentence exercise. Write down whether the hints still appear and how many seconds they take.
8. Press Shift+Esc inside Chrome. Write down the tab's "Memory footprint" at its peak and after your first hint.

   At the same two moments, also write down from Windows Task Manager (open it with Ctrl+Shift+Esc):
   - Details tab: the memory of powershell.exe, in the "Memory (active private working set)" column. This is the small web server; the Chrome number leaves it out.
   - Performance tab > Memory: the total memory "In use".
9. Open /eval, run it, press Download counts (.txt) and take a screenshot of the counts.
10. Close the tab and check that the learner records are gone.

If the laptop freezes or the model won't load, don't try more than twice. Write down exactly what happened, because that result is honest and useful too.

Send the numbers from steps 1, 6, 7, 8 and 9 at about 08:30.
