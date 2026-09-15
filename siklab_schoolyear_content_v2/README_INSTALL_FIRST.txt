SIKLAB CONTROLLER APP - FULL UPDATE
===================================

THIS PACKAGE IS FOR YOU IF:
- You have NOT installed the previous Local/Offline controller update.
- You want Netlify + Supabase to stay online for normal SikLab use.
- You want classroom gameplay button input to go directly ESP32 -> laptop.
- You want a Windows app with START / STOP instead of terminal commands.

WHAT CHANGES
============
Replace these existing project files:

  js/11_esp32.js
  js/13_device_setup.js

Flash this firmware to BOTH physical ESP32 controllers:

  esp32/SikLab_Controller_Hybrid_App.ino

Add this folder to your SikLab project:

  controller-app/

You can also copy these helpers to your project root:

  START_CONTROLLER_APP.bat
  BUILD_CONTROLLER_EXE.bat

NO SQL MIGRATION IS REQUIRED.
NO SUPABASE DATABASE CHANGE IS REQUIRED.
YOUR NETLIFY SITE REMAINS ONLINE.

------------------------------------------------------------
1. COPY THE FILES
------------------------------------------------------------

Extract this ZIP.
Copy/merge its contents into the SAME SikLab project folder that contains:

  index.html
  js/
  supabase/
  games/

After copying, the important structure is:

  YOUR-SIKLAB-PROJECT/
  |-- index.html
  |-- js/
  |   |-- 11_esp32.js              [REPLACED]
  |   `-- 13_device_setup.js       [REPLACED]
  |-- esp32/
  |   `-- SikLab_Controller_Hybrid_App.ino
  |-- controller-app/
  |   |-- SikLab_Controller_App.py
  |   |-- requirements.txt
  |   |-- RUN_APP.bat
  |   `-- BUILD_EXE.bat
  |-- START_CONTROLLER_APP.bat
  `-- BUILD_CONTROLLER_EXE.bat

Your existing index.html already loads js/11_esp32.js and js/13_device_setup.js,
so no index.html change is required.

------------------------------------------------------------
2. FLASH BOTH ESP32 CONTROLLERS
------------------------------------------------------------

Open:
  esp32/SikLab_Controller_Hybrid_App.ino

The supplied file already contains the SikLab cloud Project Ref and publishable
key that were being used by the project when this package was prepared.
If you changed Supabase projects later, update ONLY these two values:

  SUPABASE_PROJECT_REF
  SUPABASE_PUBLISHABLE_KEY

Never put sb_secret_... in ESP firmware.

Compile/upload the SAME firmware to P1 and P2.
Player assignment is still saved from the QR setup page.

Arduino libraries used by this firmware:
- DFRobotDFPlayerMini
- WebSocketsClient / arduinoWebSockets
- ArduinoJson

------------------------------------------------------------
3. RUN THE WINDOWS APP
------------------------------------------------------------

EASIEST:
Double-click:

  START_CONTROLLER_APP.bat

The first run installs two small Python packages and opens the SikLab Controller
window.

If Windows asks about firewall/network access, allow it on PRIVATE networks so
the ESP32 controllers can reach port 8765.

The app shows:
- Local service RUNNING / STOPPED
- Laptop/hotspot IPv4
- Player 1 ONLINE/OFFLINE
- Player 2 ONLINE/OFFLINE
- START CONTROLLERS
- STOP CONTROLLERS
- OPEN SIKLAB
- P1 QR / P2 QR

IMPORTANT:
START/STOP means start/stop the local controller communication service.
It does NOT physically cut power to the ESP32. The ESP32 can remain powered and
will reconnect automatically when START is pressed again.

------------------------------------------------------------
4. OPTIONAL: BUILD ONE WINDOWS EXE
------------------------------------------------------------

Double-click:

  BUILD_CONTROLLER_EXE.bat

It uses PyInstaller and creates:

  SikLab_Controller_App.exe

in your SikLab project root.

Keep the EXE in the project folder beside index.html. Then you can launch the
controller app without opening Python or a terminal.

------------------------------------------------------------
5. FIRST-TIME LOCAL CONTROLLER SETUP
------------------------------------------------------------

A) Turn on a local Wi-Fi network that BOTH the laptop and controllers can join.
   This can be:
   - Windows Mobile Hotspot
   - a normal Wi-Fi router, even with NO internet

B) Open SikLab Controller App.

C) Make sure the shown Laptop / Hotspot IPv4 is correct.
   Common Windows hotspot IP:
       192.168.137.1
   The Detect button can try to find it automatically.

D) Press:
       START CONTROLLERS

E) For Player 1:
   1. On the ESP32 hold BUTTON 5 + JOYSTICK LEFT for about 3 seconds.
   2. On your phone connect to:
          SikLab-Setup-XXXXXX
      Password:
          SikLabAdmin123
   3. On the laptop Controller App press P1 QR.
   4. Scan the QR with your phone.
   5. The ESP page automatically receives:
          player = player1
          mode = local
          laptop IP
          port = 8765
   6. Enter only the classroom Wi-Fi/hotspot SSID + password.
   7. Save & Connect.

F) Repeat for Player 2 using P2 QR.

LOCAL MODE DOES NOT REQUIRE THE LONG SUPABASE DEVICE TOKEN.
The old cloud token is NOT deleted. It remains stored for Cloud Mode.

------------------------------------------------------------
6. PLAY WITH VERY LOW CONTROLLER LATENCY
------------------------------------------------------------

In the Windows app press:

  START CONTROLLERS
  OPEN SIKLAB

The app opens:

  http://127.0.0.1:3000

Do not use the Netlify tab for Local Fast gameplay.
The local page still uses your Supabase Cloud backend for students, lessons,
questions, etc. if internet is available, but BUTTON INPUT does not go through
Supabase.

Local button path:

  ESP32 -> local Wi-Fi -> Windows Controller App -> SikLab game

There is no HTTPS POST or cloud round-trip per button press.
The firmware also disables ESP32 Wi-Fi sleep and sends state changes immediately.

------------------------------------------------------------
7. NETLIFY STILL WORKS
------------------------------------------------------------

Your public site remains:

  https://siklab2027.netlify.app

When SikLab is opened from Netlify, js/11_esp32.js automatically falls back to
Cloud/Supabase controller mode.

When SikLab is opened from the Windows app at 127.0.0.1:3000, the code
automatically detects the local app and uses Local Fast Mode.

You do NOT need to manually toggle localStorage modes.

------------------------------------------------------------
8. HOW START / STOP WORKS
------------------------------------------------------------

START CONTROLLERS:
- starts the local SikLab website on port 3000
- starts the controller WebSocket listener on port 8765
- P1/P2 reconnect automatically

STOP CONTROLLERS:
- closes the local WebSocket listener
- disconnects P1/P2 from the laptop
- stops the local website
- ESP32 units may remain powered and keep retrying

Press START again and they should reconnect automatically.

------------------------------------------------------------
9. IF P1/P2 DO NOT CONNECT
------------------------------------------------------------

Check:
1. App says RUNNING.
2. ESP and laptop are on the same Wi-Fi/hotspot.
3. The IP saved in each ESP matches the app's IPv4.
4. Windows Firewall allowed the app/Python on Private networks.
5. Port 8765 is not blocked.
6. If the laptop IP changed, enter ESP setup mode again and scan a fresh QR.

------------------------------------------------------------
10. IMPORTANT ABOUT "ZERO DELAY"
------------------------------------------------------------

No wireless controller can have literally zero latency, but this removes the
largest source of SikLab delay: the internet/Supabase round trip for every
button state.

Expected path is now local and persistent WebSocket based, which should feel
much closer to a normal controller than the cloud HTTP input path.
