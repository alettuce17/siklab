SIKLAB — EASY CONNECT HYBRID CONTROLLERS (built from your 2026-09-26 uploaded ZIP)
================================================================================

WHAT WAS WRONG WITH YOUR UPLOADED PROJECT
- The esp32/SikLab_Controller_Cloud/SikLab_Controller_Cloud.ino in the upload was CLOUD ONLY:
  it could not read mode=local, server=..., or the laptop QR configuration.
- The Python Windows Controller App and JS/13_device_setup.js already had local-mode features,
  but the older ESP firmware ignored them.
- The Windows app could auto-select a VPN/virtual adapter IP. We added interface selection
  and UDP auto-discovery so the ESP can find the proper Windows network interface.

COPY EXACTLY THESE FILES INTO YOUR EXISTING INNER SIKLAB FOLDER
  esp32/SikLab_Controller_Cloud/SikLab_Controller_Cloud.ino    REPLACE
  controller-app/SikLab_Controller_App.py                     REPLACE
  js/13_device_setup.js                                      REPLACE
  controller-app/RUN_APP.bat                                  KEEP/REPLACE
  controller-app/BUILD_EXE.bat                                KEEP/REPLACE
  controller-app/requirements.txt                             KEEP/REPLACE
  START_CONTROLLER_APP.bat                                    KEEP/REPLACE
  BUILD_CONTROLLER_EXE.bat                                    KEEP/REPLACE
  ALLOW_WINDOWS_FIREWALL_PRIVATE.bat                          ADD
  tests/test_controller_protocol.py                           OPTIONAL TESTS

YOUR inner SikLab root is the folder WITH index.html:
  C:\Users\rogie\Downloads\siklab_schoolyear_content_v2\siklab_schoolyear_content_v2

VERY IMPORTANT: If you already built SikLab_Controller_App.exe, the old EXE does not
change when you replace the .py file. Close old EXE, run START_CONTROLLER_APP.bat
(which uses the updated Python file), OR rebuild using BUILD_CONTROLLER_EXE.bat.

1) On Windows, connect laptop to a classroom Wi-Fi or start Windows Mobile Hotspot.
   The ESP32 needs a 2.4GHz network. The Windows app does not turn on Windows hotspot.
2) Run START_CONTROLLER_APP.bat -> START CONTROLLERS.
   Press CHOOSE IP if needed; select Wi-Fi/hotspot adapter, not WSL/VPN.
   If you see a Windows firewall popup, allow access on PRIVATE networks.
   If ESP32 cannot discover the laptop, right-click ALLOW_WINDOWS_FIREWALL_PRIVATE.bat,
   Run as administrator, and check Windows network profile is Private.
3) Arduino IDE: open esp32/SikLab_Controller_Cloud/SikLab_Controller_Cloud.ino.
   Flash THIS corrected sketch to BOTH ESP32s. It uses your original hardware pins
   (UP 26, DOWN 25, LEFT 33, RIGHT 32, B1 13, B2 14, B3 15, B4 18, B5 19).
   Existing cloud token stored in NVS is kept; no 'Erase All Flash' needed.
   Arduino libraries remain: ArduinoJson 7, WebSockets, DFRobotDFPlayerMini.
4) First boot: ESP32 opens SikLab-Setup-E9BFB4 or SikLab-Setup-XXXXXX.
   Password: SikLabAdmin123. Phone may say 'No internet' -> Stay connected.
   Phone should visit http://192.168.4.1 (not https).
5) On Windows app, click PLAYER 1 SETUP QR; connect phone to P1 AP and scan.
   QR now contains player, mode=local, fallback laptop IP, port and PRIVATE local pairing
   code. Local setup DOES NOT need the long Supabase token.
   Fill 2.4GHz classroom Wi-Fi SSID/password. Click SAVE & CONNECT.
   The browser saying 'Configuration saved' means SETTINGS saved, not online yet.
6) ESP32 joins Wi-Fi, tries QR IP and broadcasts UDP discovery if not connected.
   Windows app replies with correct laptop interface and P1 appears ONLINE when paired.
   Repeat P2 setup QR on second ESP32.
7) Click OPEN SIKLAB (http://127.0.0.1:3000), login with your Supabase teacher account,
   open game. Button traffic is local: ESP -> ws://laptop:8765/controller -> browser.
8) On NEXT POWER-ON, ESP opens setup portal AGAIN as you requested (never immediately
   reconnects silently to old 'G1'). Tap PLAY WITH SAVED SETTINGS: no QR/token/password
   entry needed. After clicking, it reboots and connects to the saved classroom Wi-Fi.

DIAGNOSE
- Serial at 115200 should include 'SIKLAB HYBRID EASY CONNECT • 2026-09-26'.
  If you see '[REALTIME] Disconnected' while expecting local mode, you flashed old code
  or chose Cloud rather than Local Fast.
- Correct logs: Mode: local; Wi-Fi connected; [LOCAL] ...; [LOCAL] Connected ...
- If it says wrong pairing, generate NEW QR in your actual Windows app and Save & Connect.
- If IP changed (e.g. 192.168.110.x -> 10.143.84.x), UDP discovery handles it when
  both devices are on the same reachable LAN. Router client isolation or firewall can
  block discovery/8765. Choose IP and re-scan QR as manual fallback.
- To verify Windows TCP is running: netstat -ano | findstr :8765
- To check ESP IP: Arduino Serial Monitor -> LAN IP: ...
- To check laptop adapter IP: ipconfig (Wireless LAN adapter Wi-Fi / hotspot).
- Do NOT put 0.0.0.0 or 127.0.0.1 in the ESP 'Laptop IP' field.

CLOUD STILL AVAILABLE
- Choose Cloud in the ESP setup page to use your saved Supabase token.
- Open Netlify for hosted SikLab and existing Supabase controller mode.
- The local Controller App serves the SAME static SikLab files on localhost:3000 and
  still connects to Supabase Cloud for teacher login, lessons, questions and scores.
  FULL OFFLINE AUTH/DATA are NOT implemented. Only the controller input path is local.
- Cloud firmware paths are unchanged in this update (including existing HTTPS TLS
  setInsecure behavior). The fast local path avoids internet for gameplay input.

PRIVACY & SECURITY
- Your Python app stores its local pairing code at:
    %LOCALAPPDATA%\SikLabController\pairing.json
  This is outside the web root. It is not a Supabase token and not in the GitHub ZIP.
- QR codes contain the local pairing code. Only show them to teachers setting up
  classroom controllers. If local pairing file is deleted, re-pair BOTH controllers.
- Do NOT upload your original 67 MB ZIP to GitHub or Netlify; it contains local .env,
  Supabase temporary data, and built EXE. Upload the website source with .gitignore.
- No SQL migration, Cloud Edge Function deploy, or Netlify configuration change is
  required for this local-controller improvement. To update Netlify QR/teacher UI,
  push js/13_device_setup.js as normal.

TESTS
  cd to THIS update folder (not the main SikLab project) then:
  py -m pip install -r controller-app\requirements.txt
  py -m unittest discover -s tests -v
  (The real ESP sketch must be compiled/uploaded in Arduino IDE; not compiled here.)
================================================================================
