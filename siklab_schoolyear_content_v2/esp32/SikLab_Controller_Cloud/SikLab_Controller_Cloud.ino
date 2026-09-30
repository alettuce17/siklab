#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <Preferences.h>
#include <HardwareSerial.h>
#include <DFRobotDFPlayerMini.h>
#include <WebSocketsClient.h>
#include <WiFiUdp.h>
#include <DNSServer.h>
#include <ArduinoJson.h>
#include <mbedtls/md.h>
#include <mbedtls/sha256.h>

// ============================================================
// SIKLAB HYBRID EASY CONNECT CONTROLLER
// Fast local Windows app + optional Supabase Cloud backend
//
// SAME firmware for Player 1 and Player 2.
// Player assignment is saved from the ESP setup page.
//
// SETUP SHORTCUT:
// Hold BUTTON 5 + JOYSTICK LEFT for 3 seconds.
// Existing Wi-Fi/player/device-token settings are preserved.
// ============================================================

// ============================================================
// EDIT THESE TWO VALUES
// Publishable key is safe to ship in client firmware.
// NEVER put a Supabase secret key in ESP firmware.
// ============================================================
const char* SUPABASE_PROJECT_REF = "xdnfldzjkzcpzxnclysr";
const char* SUPABASE_PUBLISHABLE_KEY = "sb_publishable_qGXt-lD4Pwp8mSc1AbxRKw_yvICCoO9";

// ============================================================
// GLOBAL OBJECTS
// ============================================================
Preferences preferences;
WebServer webServer(80);
HardwareSerial mySoftwareSerial(2);
DFRobotDFPlayerMini myDFPlayer;
WebSocketsClient realtimeSocket;
WebSocketsClient localSocket;
WiFiUDP discoveryUdp;
DNSServer dnsServer;
bool localConnected = false;
bool localSocketStarted = false;
bool pendingLocalSocketStart = false;
unsigned long lastDiscovery = 0;
unsigned long lastLocalStatus = 0;
const uint16_t DISCOVERY_PORT = 8766;
const uint32_t LOCAL_HEARTBEAT_MS = 2000;
WiFiClientSecure httpsClient;

bool dfPlayerReady = false;
bool setupMode = false;
bool restartRequested = false;
bool realtimeJoined = false;
unsigned long restartAt = 0;
unsigned long lastRealtimeHeartbeat = 0;
unsigned long realtimeRef = 1;

// ============================================================
// STORED CONFIGURATION
// ============================================================
char wifiSSID[64] = "";
char wifiPassword[64] = "";
char playerName[16] = "";
char deviceToken[96] = "";
char connectionMode[12] = "local";
char localServer[40] = "";
char localPairingCode[65] = "";
uint16_t localPort = 8765;

const char* PREF_NAMESPACE = "siklab-cfg";
const char* SETUP_AP_PASSWORD = "SikLabAdmin123";

// ============================================================
// SPECIAL SETUP COMBINATION
// ============================================================
const unsigned long SETUP_COMBO_HOLD_MS = 3000;
bool setupComboActive = false;
unsigned long setupComboStart = 0;

// ============================================================
// CONTROLLER PINS
// ============================================================
const int pinUp = 26;
const int pinDown = 25;
const int pinLeft = 33;
const int pinRight = 32;

const int pinB1 = 13;
const int pinB2 = 14;
const int pinB3 = 15;
const int pinB4 = 18;
const int pinB5 = 19;

const int pinLed1 = 2;
const int pinLed2 = 4;
const int pinLed3 = 5;
const int pinLed4 = 21;
const int pinLed5 = 22;

const int buttonPins[5] = { pinB1, pinB2, pinB3, pinB4, pinB5 };
const int ledPins[5] = { pinLed1, pinLed2, pinLed3, pinLed4, pinLed5 };

// ============================================================
// DFPLAYER TRACKS
// ============================================================
const int TRACK_BUTTON_1 = 1;
const int TRACK_BUTTON_2 = 2;
const int TRACK_BUTTON_3 = 3;
const int TRACK_BUTTON_4 = 4;
const int TRACK_BUTTON_5 = 5;
const int TRACK_CORRECT = 6;
const int TRACK_WRONG = 7;
const int TRACK_GAME_1 = 8;
const int TRACK_GAME_2 = 9;

// ============================================================
// INPUT STATE
// ============================================================
String lastStateStr = "";
unsigned long lastSendTime = 0;
int lastButtonStates[5] = { HIGH, HIGH, HIGH, HIGH, HIGH };

// ============================================================
// HELPERS
// ============================================================
String getDeviceID() {
  uint64_t chipID = ESP.getEfuseMac();
  uint32_t shortID = (uint32_t)(chipID & 0xFFFFFF);
  String id = String(shortID, HEX);
  id.toUpperCase();
  while (id.length() < 6) id = "0" + id;
  return id;
}

String htmlEscape(String value) {
  value.replace("&", "&amp;");
  value.replace("<", "&lt;");
  value.replace(">", "&gt;");
  value.replace("\"", "&quot;");
  value.replace("'", "&#39;");
  return value;
}

bool isValidPlayer(const String& player) {
  return player == "player1" || player == "player2";
}

bool supabaseConfigured() {
  String ref = String(SUPABASE_PROJECT_REF);
  String key = String(SUPABASE_PUBLISHABLE_KEY);
  return ref.length() > 5 &&
         ref != "YOUR_PROJECT_REF" &&
         key.startsWith("sb_publishable_") &&
         !key.endsWith("REPLACE_ME");
}

String supabaseBaseURL() {
  return "https://" + String(SUPABASE_PROJECT_REF) + ".supabase.co";
}

String controllerEventURL() {
  return supabaseBaseURL() + "/functions/v1/controller-event";
}

String realtimeHost() {
  return String(SUPABASE_PROJECT_REF) + ".supabase.co";
}

String realtimePath() {
  return "/realtime/v1/websocket?apikey=" + String(SUPABASE_PUBLISHABLE_KEY) + "&vsn=1.0.0";
}

bool hasSavedConfiguration() {
  return strlen(wifiSSID) > 0 &&
         isValidPlayer(String(playerName)) &&
         ((strcmp(connectionMode, "local") == 0 && strlen(localPairingCode) >= 16) ||
          (strcmp(connectionMode, "cloud") == 0 && strlen(deviceToken) >= 32));
}

// ============================================================
// HEX / SHA / HMAC
// ============================================================
String bytesToHex(const unsigned char* data, size_t length) {
  const char* hexChars = "0123456789abcdef";
  String result;
  result.reserve(length * 2);
  for (size_t i = 0; i < length; i++) {
    result += hexChars[(data[i] >> 4) & 0x0F];
    result += hexChars[data[i] & 0x0F];
  }
  return result;
}

String sha256Hex(const String& input) {
  unsigned char hash[32];
  mbedtls_sha256_context ctx;
  mbedtls_sha256_init(&ctx);
  mbedtls_sha256_starts(&ctx, 0);
  mbedtls_sha256_update(&ctx,
                        reinterpret_cast<const unsigned char*>(input.c_str()),
                        input.length());
  mbedtls_sha256_finish(&ctx, hash);
  mbedtls_sha256_free(&ctx);
  return bytesToHex(hash, 32);
}

String hmacSha256Hex(const String& key, const String& message) {
  unsigned char output[32];
  const mbedtls_md_info_t* mdInfo = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  mbedtls_md_hmac(
    mdInfo,
    reinterpret_cast<const unsigned char*>(key.c_str()),
    key.length(),
    reinterpret_cast<const unsigned char*>(message.c_str()),
    message.length(),
    output
  );
  return bytesToHex(output, 32);
}

bool constantTimeEquals(const String& a, const String& b) {
  if (a.length() != b.length()) return false;
  uint8_t diff = 0;
  for (size_t i = 0; i < a.length(); i++) diff |= (uint8_t)(a[i] ^ b[i]);
  return diff == 0;
}

// ============================================================
// LED ANIMATIONS
// ============================================================
void startupAnimation() {
  for (int cycle = 0; cycle < 2; cycle++) {
    for (int i = 0; i < 5; i++) {
      digitalWrite(ledPins[i], HIGH);
      delay(70);
      digitalWrite(ledPins[i], LOW);
    }
  }
}

void successAnimation() {
  for (int cycle = 0; cycle < 3; cycle++) {
    for (int i = 0; i < 5; i++) digitalWrite(ledPins[i], HIGH);
    delay(120);
    for (int i = 0; i < 5; i++) digitalWrite(ledPins[i], LOW);
    delay(120);
  }
}

// ============================================================
// CONFIGURATION STORAGE
// ============================================================
void loadConfiguration() {
  preferences.begin(PREF_NAMESPACE, true);
  String ssid = preferences.getString("wifi_ssid", "");
  String pass = preferences.getString("wifi_pass", "");
  String player = preferences.getString("player", "");
  String token = preferences.getString("device_token", "");
  String mode = preferences.getString("mode", "local");
  String host = preferences.getString("local_host", "");
  String pair = preferences.getString("local_pair", "");
  int port = preferences.getInt("local_port", 8765);
  preferences.end();

  if (mode != "local" && mode != "cloud") mode = "local";
  if (port < 1 || port > 65535) port = 8765;
  ssid.toCharArray(wifiSSID, sizeof(wifiSSID));
  pass.toCharArray(wifiPassword, sizeof(wifiPassword));
  player.toCharArray(playerName, sizeof(playerName));
  token.toCharArray(deviceToken, sizeof(deviceToken));
  mode.toCharArray(connectionMode, sizeof(connectionMode));
  host.toCharArray(localServer, sizeof(localServer));
  pair.toCharArray(localPairingCode, sizeof(localPairingCode));
  localPort = (uint16_t)port;

  Serial.println("\n=== SikLab Hybrid Configuration ===");
  Serial.print("Device ID: "); Serial.println(getDeviceID());
  Serial.print("Wi-Fi saved: "); Serial.println(strlen(wifiSSID) ? wifiSSID : "(none)");
  Serial.print("Player: "); Serial.println(strlen(playerName) ? playerName : "(none)");
  Serial.print("Mode: "); Serial.println(connectionMode);
  Serial.print("Local fallback: "); Serial.print(strlen(localServer) ? localServer : "auto-discover");
  Serial.print(":"); Serial.println(localPort);
  Serial.print("Local pairing: "); Serial.println(strlen(localPairingCode) >= 16 ? "SAVED" : "NOT SET");
  Serial.print("Cloud token: "); Serial.println(strlen(deviceToken) >= 32 ? "SAVED" : "NOT SET");
  Serial.println("===================================");
}

void saveConfiguration(
  const String& ssid, const String& password, const String& player,
  const String& token, const String& mode, const String& host,
  uint16_t port, const String& pair
) {
  preferences.begin(PREF_NAMESPACE, false);
  preferences.putString("wifi_ssid", ssid);
  preferences.putString("wifi_pass", password);
  preferences.putString("player", player);
  preferences.putString("device_token", token); // cloud token is preserved in local mode
  preferences.putString("mode", mode);
  preferences.putString("local_host", host);
  preferences.putInt("local_port", port);
  preferences.putString("local_pair", pair);
  preferences.putBool("run_once", true); // connect AFTER the setup page has been submitted
  preferences.end();
  ssid.toCharArray(wifiSSID, sizeof(wifiSSID));
  password.toCharArray(wifiPassword, sizeof(wifiPassword));
  player.toCharArray(playerName, sizeof(playerName));
  token.toCharArray(deviceToken, sizeof(deviceToken));
  mode.toCharArray(connectionMode, sizeof(connectionMode));
  host.toCharArray(localServer, sizeof(localServer));
  pair.toCharArray(localPairingCode, sizeof(localPairingCode));
  localPort = port;
}

bool consumeRunOnce() {
  preferences.begin(PREF_NAMESPACE, false);
  bool run = preferences.getBool("run_once", false);
  if (run) preferences.putBool("run_once", false);
  preferences.end();
  return run;
}

void sendSetupError(const String& message);

void startSavedSettingsAfterPortal() {
  if (!hasSavedConfiguration()) {
    sendSetupError("Save a complete controller configuration first.");
    return;
  }
  preferences.begin(PREF_NAMESPACE, false);
  preferences.putBool("run_once", true);
  preferences.end();
  webServer.send(200, "text/html",
    "<meta name='viewport' content='width=device-width,initial-scale=1'><body style='font:18px Arial;padding:30px'><h2>Starting SikLab...</h2><p>You may reconnect your phone to the classroom Wi-Fi.</p></body>");
  restartRequested = true;
  restartAt = millis() + 700;
}

void requestSetupMode() {
  preferences.begin(PREF_NAMESPACE, false);
  preferences.putBool("force_setup", true);
  preferences.end();

  Serial.println("[SETUP] Button 5 + LEFT held for 3 seconds.");
  Serial.println("[SETUP] Restarting into configuration mode...");
  successAnimation();
  delay(250);
  ESP.restart();
}

bool consumeSetupModeRequest() {
  preferences.begin(PREF_NAMESPACE, false);
  bool requested = preferences.getBool("force_setup", false);
  if (requested) preferences.putBool("force_setup", false);
  preferences.end();
  return requested;
}

bool checkSetupCombo() {
  bool b5 = digitalRead(pinB5) == LOW;
  bool left = digitalRead(pinLeft) == LOW;

  if (b5 && left) {
    if (!setupComboActive) {
      setupComboActive = true;
      setupComboStart = millis();
      Serial.println("[SETUP] Hold Button 5 + LEFT...");
    }

    unsigned long held = millis() - setupComboStart;
    if (held >= 1000) digitalWrite(pinLed5, HIGH);
    if (held >= SETUP_COMBO_HOLD_MS) requestSetupMode();
    return true;
  }

  if (setupComboActive) {
    setupComboActive = false;
    setupComboStart = 0;
    digitalWrite(pinLed5, LOW);
    Serial.println("[SETUP] Combination cancelled.");
  }

  return false;
}

// ============================================================
// WIFI
// ============================================================
bool connectToSavedWiFi() {
  if (!hasSavedConfiguration()) return false;

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(wifiSSID, wifiPassword);

  Serial.print("Connecting to Wi-Fi: ");
  Serial.println(wifiSSID);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    delay(300);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Wi-Fi connection failed.");
    return false;
  }

  WiFi.setSleep(false); // reduce latency for a game controller
  Serial.println("Wi-Fi connected.");
  Serial.print("LAN IP: "); Serial.println(WiFi.localIP());
  Serial.print("Device ID: "); Serial.println(getDeviceID());
  Serial.print("Role: "); Serial.println(playerName);
  return true;
}

// ============================================================
// ESP SETUP PAGE
// ============================================================
void sendSetupError(const String& message) {
  String html = "<!doctype html><html><meta name='viewport' content='width=device-width,initial-scale=1'>";
  html += "<body style='font-family:Arial;background:#1c1917;padding:24px'>";
  html += "<div style='max-width:520px;margin:auto;background:white;padding:28px;border-radius:20px'>";
  html += "<h2 style='color:#dc2626'>Configuration Error</h2><p>";
  html += htmlEscape(message);
  html += "</p><a href='/' style='color:#ea580c;font-weight:bold'>Return to Setup</a></div></body></html>";
  webServer.send(400, "text/html", html);
}

bool localHostValid(const String& host) {
  IPAddress ip;
  return ip.fromString(host) &&
         ip[0] != 0 && ip[0] != 127 && ip[0] != 224 && ip[0] != 255;
}

void handleSetupHome() {
  String player = webServer.arg("player");
  if (!isValidPlayer(player)) player = String(playerName);
  String mode = webServer.arg("mode");
  if (mode != "local" && mode != "cloud") mode = String(connectionMode);
  if (mode != "local" && mode != "cloud") mode = "local";
  String host = webServer.arg("server");
  if (!localHostValid(host)) host = String(localServer);
  String pair = webServer.arg("pair");
  if (pair.length() < 16 || pair.length() > 64) pair = String(localPairingCode);
  String portStr = webServer.arg("port");
  int port = portStr.length() ? portStr.toInt() : localPort;
  if (port < 1 || port > 65535) port = 8765;

  String html;
  html.reserve(12500);
  html += R"SIKLAB(<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><title>SikLab Controller Setup</title><style>
*{box-sizing:border-box}body{font:15px Arial,sans-serif;background:#111827;color:#172033;margin:0}.box{max-width:510px;margin:16px auto;padding:0 12px}.head{padding:19px 20px;background:linear-gradient(100deg,#f97316,#dc2626);color:#fff;border-radius:16px 16px 0 0}.head h2{margin:4px 0}.card{background:#fff;padding:19px;border-radius:0 0 16px 16px}.hint{font-size:12px;color:#64748b;line-height:1.5}.pill{border-radius:10px;padding:12px;background:#ecfdf5;color:#047857;margin-bottom:14px}.field{margin:13px 0}label{display:block;font-weight:bold;font-size:12px;margin-bottom:6px}input,select{width:100%;padding:12px;font-size:16px;border:1px solid #cbd5e1;border-radius:10px}.row{display:flex;gap:8px}.row>*{flex:1}button{padding:14px;background:#ea580c;border:0;color:#fff;border-radius:10px;font-weight:bold;font-size:16px;width:100%;cursor:pointer}.secondary{background:#334155;margin-top:13px}#cloud,#local{background:#f8fafc;padding:12px;border-radius:12px;margin-top:13px}hr{border:0;border-top:1px solid #e2e8f0;margin:16px 0}
</style></head><body><div class="box"><div class="head"><small>SIKLAB • ESP32</small><h2>Connect Controller</h2></div><div class="card"><div class="pill">Device: <strong>)SIKLAB";
  html += getDeviceID();
  html += "</strong><br>Setup Wi-Fi: SikLab-Setup-" + getDeviceID() + "</div>";
  if (hasSavedConfiguration()) {
    html += "<form action='/resume' method='POST'><button type='submit' class='secondary'>PLAY WITH SAVED SETTINGS</button></form>";
    html += "<p class='hint'>No need to scan a QR again unless Wi-Fi, player, or Windows app pairing changed.</p><hr>";
  }
  html += "<form action='/configure' method='POST'>";
  html += "<div class='field'><label>Player</label><select name='player' required>";
  html += "<option value='player1'" + String(player == "player1" ? " selected" : "") + ">Player 1</option>";
  html += "<option value='player2'" + String(player == "player2" ? " selected" : "") + ">Player 2</option></select></div>";
  html += "<div class='field'><label>Connection Mode</label><select name='mode' id='mode' onchange='modeSwitch()'>";
  html += "<option value='local'" + String(mode == "local" ? " selected" : "") + ">LOCAL FAST — Windows App</option>";
  html += "<option value='cloud'" + String(mode == "cloud" ? " selected" : "") + ">CLOUD — Supabase</option></select></div>";
  html += "<div class='field'><label>Classroom Wi-Fi / hotspot name</label>";
  html += "<input name='ssid' id='ssid' maxlength='32' required placeholder='Your laptop hotspot / router' value='" + htmlEscape(String(wifiSSID)) + "'>";
  html += "<div class='hint'>Choose a 2.4 GHz Wi-Fi network shared by your laptop and ESP32. Internet is not needed for local button presses.</div></div>";
  html += "<div class='field'><label>Wi-Fi password</label><input type='password' name='password' maxlength='63' placeholder='Leave blank to keep password for SAME Wi-Fi name'></div>";
  html += "<div id='local'><b>Local Fast Mode</b><p class='hint'>Scan P1/P2 QR in Windows SikLab Controller App; it fills the pairing and server. The ESP can automatically discover a changed laptop IP after joining Wi-Fi.</p>";
  html += "<div class='field'><label>Windows app pairing code</label><input name='pairing_code' type='password' autocomplete='off' maxlength='64' placeholder='Filled by the Windows QR; blank keeps saved' value='" + htmlEscape(pair) + "'>";
  html += "<div class='hint'>" + String(pair.length() >= 16 ? "Pairing information present ✓" : "Required on first local setup. Get it by scanning the Windows app QR.") + "</div></div>";
  html += "<div class='row'><div class='field'><label>Laptop IP (optional)</label><input name='server' maxlength='39' placeholder='Auto-discover' value='" + htmlEscape(host) + "'></div>";
  html += "<div class='field'><label>Port</label><input type='number' min='1' max='65535' name='port' value='" + String(port) + "'></div></div>";
  html += "<p class='hint'>Leave IP blank to rely on discovery; QR provides an IP fallback if your router blocks discovery.</p></div>";
  html += "<div id='cloud'><b>Supabase Cloud Mode</b><div class='field'><label>Supabase device token</label><input type='password' name='device_token' maxlength='95' placeholder='Leave blank to keep saved cloud token'>";
  html += "<p class='hint'>Only cloud mode needs the original Supabase device token.</p></div></div>";
  html += "<button type='submit' style='margin-top:14px'>SAVE & CONNECT</button></form>";
  html += R"SIKLAB(<script>function modeSwitch(){var l=document.getElementById('local'),c=document.getElementById('cloud');var local=document.getElementById('mode').value==='local';l.style.display=local?'block':'none';c.style.display=local?'none':'block'}modeSwitch();</script></div></div></body></html>)SIKLAB";
  webServer.send(200, "text/html", html);
}

void handleSetupStatus() {
  String json = "{\"status\":\"setup\",\"device_id\":\"" + getDeviceID() + "\",\"ap_ip\":\"" + WiFi.softAPIP().toString() + "\"}";
  webServer.send(200, "application/json", json);
}

void handleConfigureController() {
  String ssid = webServer.arg("ssid");
  String password = webServer.arg("password");
  String player = webServer.arg("player");
  String mode = webServer.arg("mode");
  String token = webServer.arg("device_token");
  String host = webServer.arg("server");
  String pair = webServer.arg("pairing_code");
  int port = webServer.arg("port").toInt();
  ssid.trim(); player.trim(); mode.trim(); token.trim(); host.trim(); pair.trim();
  if (ssid.isEmpty() || ssid.length() > 32) return sendSetupError("Enter classroom Wi-Fi name (max 32 characters).");
  if (!isValidPlayer(player)) return sendSetupError("Select a player.");
  if (mode != "local" && mode != "cloud") return sendSetupError("Select Local or Cloud mode.");
  if (password.isEmpty() && ssid == String(wifiSSID)) password = String(wifiPassword);
  if (password.length() > 63) return sendSetupError("Wi-Fi password too long.");
  if (token.isEmpty()) token = String(deviceToken);
  if (pair.isEmpty()) pair = String(localPairingCode);
  if (port < 1 || port > 65535) port = 8765;
  if (!host.isEmpty() && !localHostValid(host)) return sendSetupError("Laptop IP must be an IPv4 address, or blank for auto-discovery.");
  if (mode == "local" && (pair.length() < 16 || pair.length() > 64)) {
    return sendSetupError("First local setup: scan P1/P2 QR in the Windows Controller App to get its pairing code.");
  }
  if (mode == "cloud" && (token.length() < 32 || token.length() > 95)) {
    return sendSetupError("Cloud mode needs the original Supabase device token.");
  }
  saveConfiguration(ssid, password, player, token, mode, host, (uint16_t)port, pair);
  String msg = "<meta name='viewport' content='width=device-width,initial-scale=1'><body style='font:18px Arial;padding:30px'><h2>Configuration saved</h2><p>Joining classroom Wi-Fi now. The Windows app will show ONLINE only after the connection succeeds.</p><p>Return your phone to normal Wi-Fi.</p></body>";
  webServer.send(200, "text/html", msg);
  restartRequested = true;
  restartAt = millis() + 950;
}

void startSetupMode() {
  setupMode = true;
  realtimeSocket.disconnect();
  localSocket.disconnect();
  WiFi.disconnect(true, false);
  delay(150);
  WiFi.mode(WIFI_AP);
  String apName = "SikLab-Setup-" + getDeviceID();
  if (!WiFi.softAP(apName.c_str(), SETUP_AP_PASSWORD)) {
    Serial.println("[SETUP] Could not start Wi-Fi hotspot. Restarting...");
    delay(800); ESP.restart();
  }
  IPAddress apIp = WiFi.softAPIP();
  dnsServer.start(53, "*", apIp);
  Serial.println("\n[SETUP] " + apName);
  Serial.println("[SETUP] Password: " + String(SETUP_AP_PASSWORD));
  Serial.println("[SETUP] Open http://192.168.4.1");
  webServer.on("/", HTTP_GET, handleSetupHome);
  webServer.on("/configure", HTTP_POST, handleConfigureController);
  webServer.on("/resume", HTTP_POST, startSavedSettingsAfterPortal);
  webServer.on("/status", HTTP_GET, handleSetupStatus);
  webServer.onNotFound([](){ webServer.sendHeader("Location", "/", true); webServer.send(302, "text/plain", ""); });
  webServer.begin();
}

// ============================================================
// CONTROLLER -> SUPABASE EDGE FUNCTION
// ============================================================
void sendControllerState(const String& state) {
  if (WiFi.status() != WL_CONNECTED || !supabaseConfigured()) return;

  HTTPClient http;
  httpsClient.setInsecure();

  if (!http.begin(httpsClient, controllerEventURL())) {
    Serial.println("[STATE] Could not start HTTPS request.");
    return;
  }

  http.setTimeout(1500);
  http.setReuse(true);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_PUBLISHABLE_KEY);
  http.addHeader("x-device-token", String(deviceToken));

  String body = "{\"device_id\":\"" + getDeviceID() + "\",\"player\":\"" + String(playerName) + "\",\"state\":\"" + state + "\"}";
  int code = http.POST(body);

  if (code < 200 || code >= 300) {
    Serial.print("[STATE] HTTP "); Serial.println(code);
    if (code > 0) Serial.println(http.getString());
  }

  http.end();
}

// ============================================================
// SUPABASE REALTIME COMMAND CHANNEL
// ============================================================
void sendRealtimeJoin() {
  String ref = String(realtimeRef++);
  String message =
    "{\"topic\":\"realtime:siklab-controllers\","
    "\"event\":\"phx_join\","
    "\"payload\":{\"config\":{\"broadcast\":{\"ack\":false,\"self\":false},\"presence\":{\"enabled\":false},\"postgres_changes\":[],\"private\":false}},"
    "\"ref\":\"" + ref + "\",\"join_ref\":\"" + ref + "\"}";

  realtimeSocket.sendTXT(message);
}

void sendRealtimeHeartbeat() {
  String ref = String(realtimeRef++);
  String message =
    "{\"topic\":\"phoenix\",\"event\":\"heartbeat\",\"payload\":{},\"ref\":\"" + ref + "\",\"join_ref\":null}";
  realtimeSocket.sendTXT(message);
  lastRealtimeHeartbeat = millis();
}

void playCloudCommand(const String& command) {
  if (!dfPlayerReady) return;

  if (command == "g1correct") myDFPlayer.play(TRACK_CORRECT);
  else if (command == "g1wrong") myDFPlayer.play(TRACK_WRONG);
  else if (command == "g1track1" || command == "track1") myDFPlayer.play(TRACK_GAME_1);
  else if (command == "g1track2" || command == "track2") myDFPlayer.play(TRACK_GAME_2);
  else return;

  Serial.print("[CLOUD AUDIO] ");
  Serial.println(command);
}

void handleRealtimeText(uint8_t* payload, size_t length) {
  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, payload, length);
  if (error) return;

  const char* outerEvent = doc["event"] | "";

  if (strcmp(outerEvent, "phx_reply") == 0) {
    const char* status = doc["payload"]["status"] | "";
    if (strcmp(status, "ok") == 0) realtimeJoined = true;
    return;
  }

  if (strcmp(outerEvent, "broadcast") != 0) return;

  const char* eventName = doc["payload"]["event"] | "";
  if (strcmp(eventName, "controller_command") != 0) return;

  JsonObject data = doc["payload"]["payload"].as<JsonObject>();
  String targetDevice = String((const char*)(data["device_id"] | ""));
  String targetPlayer = String((const char*)(data["player"] | ""));
  String command = String((const char*)(data["command"] | ""));
  String nonce = String((const char*)(data["nonce"] | ""));
  String sig = String((const char*)(data["sig"] | ""));
  String ts = String((const char*)(data["ts"] | ""));

  if (targetDevice != getDeviceID()) return;
  if (targetPlayer != String(playerName)) return;
  if (nonce.length() < 8 || sig.length() != 64 || ts.length() < 10) return;

  String canonical = targetDevice + "|" + targetPlayer + "|" + command + "|" + ts + "|" + nonce;
  String tokenHash = sha256Hex(String(deviceToken));
  String expected = hmacSha256Hex(tokenHash, canonical);

  if (!constantTimeEquals(expected, sig)) {
    Serial.println("[REALTIME] Ignored command with invalid signature.");
    return;
  }

  playCloudCommand(command);
}

void realtimeEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      Serial.println("[REALTIME] Connected.");
      realtimeJoined = false;
      sendRealtimeJoin();
      break;

    case WStype_DISCONNECTED:
      Serial.println("[REALTIME] Disconnected.");
      realtimeJoined = false;
      break;

    case WStype_TEXT:
      handleRealtimeText(payload, length);
      break;

    case WStype_ERROR:
      Serial.println("[REALTIME] WebSocket error.");
      realtimeJoined = false;
      break;

    default:
      break;
  }
}

void startRealtime() {
  if (!supabaseConfigured()) {
    Serial.println("[REALTIME] Supabase constants are not configured.");
    return;
  }

  String host = realtimeHost();
  String path = realtimePath();

  realtimeSocket.beginSSL(host.c_str(), 443, path.c_str());
  realtimeSocket.onEvent(realtimeEvent);
  realtimeSocket.setReconnectInterval(3000);
  realtimeSocket.enableHeartbeat(15000, 3000, 2);
  lastRealtimeHeartbeat = millis();
}

// ============================================================
// LOCAL FAST CONTROLLER: DISCOVER WINDOWS APP ON LAN
// UDP discovery is optional. QR/manual host remains fallback.
// ============================================================
void beginLocalSocket() {
  if (!localHostValid(String(localServer))) return;
  localSocket.disconnect();
  localSocket.begin(localServer, localPort, "/controller");
  localSocket.onEvent([](WStype_t type, uint8_t* payload, size_t length) {
    if (type == WStype_CONNECTED) {
      localConnected = false;
      Serial.println("[LOCAL] Socket open; verifying local pairing...");
      JsonDocument doc;
      doc["type"] = "controller_hello";
      doc["device_id"] = getDeviceID();
      doc["player"] = playerName;
      doc["pairing_code"] = localPairingCode;
      String msg; serializeJson(doc, msg);
      localSocket.sendTXT(msg);
    } else if (type == WStype_DISCONNECTED) {
      Serial.println("[LOCAL] Disconnected / pairing failed. Searching/retrying...");
      localConnected = false;
    } else if (type == WStype_TEXT) {
      JsonDocument doc;
      if (deserializeJson(doc, payload, length)) return;
      String kind = doc["type"] | "";
      if (kind == "controller_ready") {
        String approvedID = doc["device_id"] | "";
        String approvedPlayer = doc["player"] | "";
        if (approvedID == getDeviceID() && approvedPlayer == String(playerName)) {
          localConnected = true;
          lastStateStr = ""; // send pressed/released state immediately after pair
          Serial.println("[LOCAL] Connected and PAIRED with Windows app: " + String(localServer) + ":" + String(localPort));
        }
      } else if (kind == "controller_command") {
        String target = doc["player"] | "";
        if (target == String(playerName)) playCloudCommand(String((const char*)(doc["command"] | "")));
      }
    } else if (type == WStype_ERROR) {
      Serial.println("[LOCAL] WebSocket error. Confirm firewall TCP 8765 and laptop IP.");
    }
  });
  localSocket.setReconnectInterval(800);
  localSocket.enableHeartbeat(6000, 1600, 2);
  localSocketStarted = true;
  pendingLocalSocketStart = false;
  Serial.println("[LOCAL] Trying ws://" + String(localServer) + ":" + String(localPort) + "/controller");
}

bool sendLocalState(const String& state) {
  if (!localConnected || !localSocketStarted) return false;
  JsonDocument doc;
  doc["type"] = "controller_state";
  doc["device_id"] = getDeviceID();
  doc["player"] = playerName;
  doc["state"] = state;
  String msg; serializeJson(doc, msg);
  localSocket.sendTXT(msg);
  return true;
}

void broadcastDiscovery() {
  if (WiFi.status() != WL_CONNECTED) return;
  // Broadcast to subnet and global broadcast (hotspots may differ).
  IPAddress ip = WiFi.localIP(), mask = WiFi.subnetMask();
  IPAddress broadcast(
    ip[0] | (uint8_t)~mask[0], ip[1] | (uint8_t)~mask[1],
    ip[2] | (uint8_t)~mask[2], ip[3] | (uint8_t)~mask[3]);
  String msg = "SIKLAB_DISCOVER|" + getDeviceID();
  discoveryUdp.beginPacket(broadcast, DISCOVERY_PORT);
  discoveryUdp.write((const uint8_t*)msg.c_str(), msg.length());
  discoveryUdp.endPacket();
  discoveryUdp.beginPacket(IPAddress(255,255,255,255), DISCOVERY_PORT);
  discoveryUdp.write((const uint8_t*)msg.c_str(), msg.length());
  discoveryUdp.endPacket();
  lastDiscovery = millis();
}

void checkDiscoveryReplies() {
  int size = discoveryUdp.parsePacket();
  if (size <= 0 || size > 120) return;
  char buf[121] = {0};
  int readCount = discoveryUdp.read((uint8_t*)buf, 120);
  if (readCount < 0) return;
  buf[readCount] = '\0';
  String reply(buf);
  if (!reply.startsWith("SIKLAB_SERVER|")) return;
  int separator = reply.indexOf('|', 14);
  if (separator < 0) return;
  String ip = reply.substring(14, separator);
  int port = reply.substring(separator + 1).toInt();
  if (!localHostValid(ip) || port < 1 || port > 65535) return;
  // Verify that the reply came from the address it advertises.
  if (discoveryUdp.remoteIP().toString() != ip) return;
  if (ip == String(localServer) && port == localPort && localSocketStarted) return;
  Serial.println("[LOCAL] Discovered Windows app at " + ip + ":" + String(port));
  ip.toCharArray(localServer, sizeof(localServer));
  localPort = (uint16_t)port;
  // Save this as a fallback for networks with broadcast blocked next time.
  preferences.begin(PREF_NAMESPACE, false);
  preferences.putString("local_host", ip);
  preferences.putInt("local_port", port);
  preferences.end();
  pendingLocalSocketStart = true;
}

void startLocalMode() {
  localConnected = false;
  localSocketStarted = false;
  lastDiscovery = 0;
  discoveryUdp.begin(0); // OS-assigned UDP source port
  if (localHostValid(String(localServer))) beginLocalSocket();
  Serial.println("[LOCAL] Windows app discovery: UDP 8766; game input: TCP 8765");
}

// ============================================================
// SETUP
// ============================================================
void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\nSIKLAB HYBRID EASY CONNECT • 2026-09-26");
  pinMode(pinUp, INPUT_PULLUP);
  pinMode(pinDown, INPUT_PULLUP);
  pinMode(pinLeft, INPUT_PULLUP);
  pinMode(pinRight, INPUT_PULLUP);
  for (int i = 0; i < 5; i++) {
    pinMode(buttonPins[i], INPUT_PULLUP);
    pinMode(ledPins[i], OUTPUT);
    digitalWrite(ledPins[i], LOW);
  }
  mySoftwareSerial.begin(9600, SERIAL_8N1, 16, 17);
  if (myDFPlayer.begin(mySoftwareSerial)) {
    dfPlayerReady = true;
    myDFPlayer.volume(30);
    Serial.println("DFPlayer OK");
  } else Serial.println("DFPlayer not detected.");
  startupAnimation();
  loadConfiguration();

  // Respect user preference: SHOW A BROWSER PORTAL AT EVERY POWER-ON.
  // After Save or Play With Saved Settings, a one-time flag allows reboot into game.
  bool requestedSetup = consumeSetupModeRequest();
  bool runOnce = consumeRunOnce();
  if (requestedSetup || !runOnce || !hasSavedConfiguration()) {
    Serial.println("[SETUP] Start browser portal; no automatic connection to old Wi-Fi.");
    startSetupMode();
    return;
  }
  if (strcmp(connectionMode, "cloud") == 0 && !supabaseConfigured()) {
    Serial.println("[CLOUD] Supabase firmware constants are invalid.");
    startSetupMode(); return;
  }
  if (!connectToSavedWiFi()) { startSetupMode(); return; }
  setupMode = false;
  if (strcmp(connectionMode, "local") == 0) startLocalMode();
  else {
    httpsClient.setInsecure(); // existing cloud path; CA validation can be hardened separately
    startRealtime();
  }
}

// ============================================================
// LOOP: button changes are sent immediately over local WebSocket.
// ============================================================
void loop() {
  if (setupMode) {
    dnsServer.processNextRequest();
    webServer.handleClient();
    if (restartRequested && (int32_t)(millis() - restartAt) >= 0) ESP.restart();
    delay(2);
    return;
  }

  if (checkSetupCombo()) { delay(1); return; }
  if (WiFi.status() != WL_CONNECTED) {
    static unsigned long retryAt = 0;
    if (millis() - retryAt >= 4000) {
      retryAt = millis();
      Serial.println("[WIFI] Disconnected, reconnecting...");
      WiFi.disconnect();
      WiFi.begin(wifiSSID, wifiPassword);
    }
    delay(2); return;
  }

  bool local = strcmp(connectionMode, "local") == 0;
  if (local) {
    checkDiscoveryReplies();
    if (!localConnected && millis() - lastDiscovery > 1800) broadcastDiscovery();
    if (pendingLocalSocketStart) beginLocalSocket();
    if (localSocketStarted) localSocket.loop();
  } else {
    realtimeSocket.loop();
    if (millis() - lastRealtimeHeartbeat > 20000) sendRealtimeHeartbeat();
  }

  int u = !digitalRead(pinUp), d = !digitalRead(pinDown);
  int l = !digitalRead(pinLeft), r = !digitalRead(pinRight);
  int b1 = !digitalRead(pinB1), b2 = !digitalRead(pinB2);
  int b3 = !digitalRead(pinB3), b4 = !digitalRead(pinB4), b5 = !digitalRead(pinB5);
  int audioButton = -1;
  for (int i=0; i<5; i++) {
    int current = digitalRead(buttonPins[i]);
    digitalWrite(ledPins[i], current == LOW ? HIGH : LOW);
    if (current == LOW && lastButtonStates[i] == HIGH && dfPlayerReady) audioButton = i;
    lastButtonStates[i] = current;
  }
  String state = String(u)+String(d)+String(l)+String(r)+
                 String(b1)+String(b2)+String(b3)+String(b4)+String(b5);
  if (state != lastStateStr || millis() - lastSendTime >= (local ? LOCAL_HEARTBEAT_MS : 2000)) {
    if (local) {
      if (sendLocalState(state)) {
        lastStateStr = state;
        lastSendTime = millis();
      }
    } else {
      sendControllerState(state);
      lastStateStr = state;
      lastSendTime = millis();
    }
  }
  // DFPlayer serial commands can block briefly. Transmit the input first so
  // shooting/answer presses do not wait for the local button sound to start.
  if (audioButton >= 0) myDFPlayer.play(audioButton + 1);
  delay(1);
}
