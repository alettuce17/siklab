#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <Preferences.h>
#include <HardwareSerial.h>
#include <DFRobotDFPlayerMini.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <mbedtls/md.h>
#include <mbedtls/sha256.h>

// ============================================================
// SIKLAB ESP32 CLOUD CONTROLLER
// Netlify frontend + Supabase backend
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
         strlen(deviceToken) >= 32;
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
  preferences.end();

  ssid.toCharArray(wifiSSID, sizeof(wifiSSID));
  pass.toCharArray(wifiPassword, sizeof(wifiPassword));
  player.toCharArray(playerName, sizeof(playerName));
  token.toCharArray(deviceToken, sizeof(deviceToken));

  Serial.println();
  Serial.println("=== SikLab Cloud Configuration ===");
  Serial.print("Device ID: "); Serial.println(getDeviceID());
  Serial.print("Wi-Fi: "); Serial.println(strlen(wifiSSID) ? wifiSSID : "(none)");
  Serial.print("Player: "); Serial.println(strlen(playerName) ? playerName : "(none)");
  Serial.print("Device token: "); Serial.println(strlen(deviceToken) >= 32 ? "SAVED" : "NOT SET");
  Serial.println("Cloud: Supabase");
  Serial.println("==================================");
}

void saveConfiguration(
  const String& ssid,
  const String& password,
  const String& player,
  const String& token
) {
  preferences.begin(PREF_NAMESPACE, false);
  preferences.putString("wifi_ssid", ssid);
  preferences.putString("wifi_pass", password);
  preferences.putString("player", player);
  preferences.putString("device_token", token);
  preferences.end();

  ssid.toCharArray(wifiSSID, sizeof(wifiSSID));
  password.toCharArray(wifiPassword, sizeof(wifiPassword));
  player.toCharArray(playerName, sizeof(playerName));
  token.toCharArray(deviceToken, sizeof(deviceToken));
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

void handleSetupHome() {
  String incomingPlayer = webServer.arg("player");
  incomingPlayer.trim();
  if (!isValidPlayer(incomingPlayer)) incomingPlayer = String(playerName);

  String selectedP1 = incomingPlayer == "player1" ? " selected" : "";
  String selectedP2 = incomingPlayer == "player2" ? " selected" : "";
  String savedSSID = htmlEscape(String(wifiSSID));
  String deviceID = getDeviceID();
  String apName = "SikLab-Setup-" + deviceID;

  String html;
  html.reserve(10000);
  html += R"rawliteral(
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SikLab ESP Setup</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#1c1917;font-family:Arial,sans-serif;color:#1e293b}.head{background:#0c0a09;color:white;padding:18px}.wrap{max-width:580px;margin:auto;padding:22px}.card{background:white;border-radius:24px;overflow:hidden}.hero{padding:22px;background:linear-gradient(120deg,#ea580c,#dc2626);color:white}.hero h1{margin:3px 0}.content{padding:24px}.info{background:#fff7ed;border:1px solid #fed7aa;padding:15px;border-radius:14px;margin-bottom:20px}.field{margin-bottom:17px}label{display:block;margin-bottom:6px;font-size:11px;text-transform:uppercase;font-weight:900;letter-spacing:.8px;color:#64748b}input,select{width:100%;padding:13px;border-radius:11px;border:2px solid #e2e8f0;font-size:16px;background:#f8fafc}.hint{font-size:11px;color:#94a3b8;margin-top:5px;line-height:1.5}button{width:100%;padding:15px;border:0;border-radius:12px;background:linear-gradient(90deg,#ea580c,#dc2626);color:white;font-weight:900;font-size:16px}.cloud{margin-top:16px;background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;padding:13px;border-radius:12px;font-size:12px;line-height:1.5}
</style>
</head>
<body>
<div class="head"><strong>SikLab ESP Player</strong></div>
<div class="wrap"><div class="card">
<div class="hero"><small>Cloud Setup</small><h1>Configure Controller</h1></div>
<div class="content">
<div class="info"><strong>Physical Device: )rawliteral";
  html += deviceID;
  html += "</strong><br><span style='font-size:12px;color:#64748b'>Setup Wi-Fi: " + apName + "</span></div>";

  html += "<form action='/configure' method='POST'>";
  html += "<div class='field'><label>Player Assignment</label><select name='player' required>";
  html += "<option value=''>Select player</option>";
  html += "<option value='player1'" + selectedP1 + ">Player 1</option>";
  html += "<option value='player2'" + selectedP2 + ">Player 2</option>";
  html += "</select></div>";

  html += "<div class='field'><label>Internet Wi-Fi / Hotspot</label>";
  html += "<input name='ssid' maxlength='32' value='" + savedSSID + "' placeholder='Example: SikLab-Classroom' required>";
  html += "<div class='hint'>Use the router or mobile hotspot that has internet access.</div></div>";

  html += "<div class='field'><label>Wi-Fi Password</label>";
  html += "<input type='password' name='password' maxlength='63' placeholder='Leave blank to keep current password'>";
  html += "<div class='hint'>If the Wi-Fi name is unchanged, blank keeps the saved password.</div></div>";

  html += "<div class='field'><label>SikLab Device Token</label>";
  html += "<input type='password' name='device_token' maxlength='95' placeholder='Paste token from Supabase provisioning'>";
  html += "<div class='hint'>Leave blank to keep the current saved token. This is NOT your Supabase secret key.</div></div>";

  html += "<button type='submit'>SAVE & CONNECT</button></form>";
  html += "<div class='cloud'><strong>Cloud Backend:</strong> Supabase<br>No laptop IP or local server address is required.</div>";
  html += "</div></div></div></body></html>";

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
  String token = webServer.arg("device_token");

  ssid.trim();
  player.trim();
  token.trim();

  if (ssid.length() == 0 || ssid.length() > 32) {
    sendSetupError("Enter a valid Wi-Fi / hotspot name.");
    return;
  }

  if (!isValidPlayer(player)) {
    sendSetupError("Select Player 1 or Player 2.");
    return;
  }

  if (password.length() == 0 && ssid == String(wifiSSID)) {
    password = String(wifiPassword);
  }

  if (password.length() > 63) {
    sendSetupError("Wi-Fi password is too long.");
    return;
  }

  if (token.length() == 0) token = String(deviceToken);
  if (token.length() < 32 || token.length() > 95) {
    sendSetupError("Paste the device token returned by Supabase provisioning.");
    return;
  }

  saveConfiguration(ssid, password, player, token);

  webServer.send(
    200,
    "text/html",
    "<!doctype html><html><meta name='viewport' content='width=device-width,initial-scale=1'><body style='font-family:Arial;background:#1c1917;padding:24px'><div style='max-width:520px;margin:auto;background:white;padding:30px;border-radius:20px;text-align:center'><h1 style='color:#16a34a'>Configuration Saved</h1><p>The controller will restart and connect to SikLab Cloud.</p><p>Reconnect your phone to your normal internet Wi-Fi/hotspot.</p></div></body></html>"
  );

  successAnimation();
  restartRequested = true;
  restartAt = millis() + 1800;
}

void startSetupMode() {
  setupMode = true;
  realtimeSocket.disconnect();
  WiFi.disconnect(true, true);
  delay(250);
  WiFi.mode(WIFI_AP);

  String apName = "SikLab-Setup-" + getDeviceID();
  if (!WiFi.softAP(apName.c_str(), SETUP_AP_PASSWORD)) {
    Serial.println("Failed to start setup AP.");
    delay(1500);
    ESP.restart();
  }

  Serial.println();
  Serial.println("=== SIKLAB SETUP MODE ===");
  Serial.print("Device ID: "); Serial.println(getDeviceID());
  Serial.print("Wi-Fi: "); Serial.println(apName);
  Serial.print("Password: "); Serial.println(SETUP_AP_PASSWORD);
  Serial.print("Open: http://"); Serial.println(WiFi.softAPIP());
  Serial.println("=========================");

  webServer.on("/", HTTP_GET, handleSetupHome);
  webServer.on("/status", HTTP_GET, handleSetupStatus);
  webServer.on("/configure", HTTP_POST, handleConfigureController);
  webServer.onNotFound([]() {
    webServer.sendHeader("Location", "/", true);
    webServer.send(302, "text/plain", "");
  });
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
// SETUP
// ============================================================
void setup() {
  Serial.begin(115200);
  delay(250);

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
  } else {
    Serial.println("DFPlayer not detected.");
  }

  startupAnimation();
  loadConfiguration();

  if (consumeSetupModeRequest()) {
    startSetupMode();
    return;
  }

  if (!supabaseConfigured()) {
    Serial.println("Supabase project ref / publishable key not configured in firmware.");
    startSetupMode();
    return;
  }

  if (!hasSavedConfiguration()) {
    Serial.println("No complete controller configuration.");
    startSetupMode();
    return;
  }

  if (!connectToSavedWiFi()) {
    startSetupMode();
    return;
  }

  setupMode = false;
  httpsClient.setInsecure();
  startRealtime();
}

// ============================================================
// LOOP
// ============================================================
void loop() {
  if (setupMode) {
    webServer.handleClient();
    if (restartRequested && millis() >= restartAt) ESP.restart();
    delay(2);
    return;
  }

  if (checkSetupCombo()) {
    delay(10);
    return;
  }

  if (WiFi.status() != WL_CONNECTED) {
    static unsigned long lastReconnect = 0;
    if (millis() - lastReconnect > 5000) {
      lastReconnect = millis();
      Serial.println("Wi-Fi disconnected. Reconnecting...");
      WiFi.disconnect();
      WiFi.begin(wifiSSID, wifiPassword);
    }
    delay(5);
    return;
  }

  realtimeSocket.loop();
  if (millis() - lastRealtimeHeartbeat > 20000) sendRealtimeHeartbeat();

  int u = !digitalRead(pinUp);
  int d = !digitalRead(pinDown);
  int l = !digitalRead(pinLeft);
  int r = !digitalRead(pinRight);
  int b1 = !digitalRead(pinB1);
  int b2 = !digitalRead(pinB2);
  int b3 = !digitalRead(pinB3);
  int b4 = !digitalRead(pinB4);
  int b5 = !digitalRead(pinB5);

  for (int i = 0; i < 5; i++) {
    int current = digitalRead(buttonPins[i]);
    digitalWrite(ledPins[i], current == LOW ? HIGH : LOW);

    if (current == LOW && lastButtonStates[i] == HIGH && dfPlayerReady) {
      myDFPlayer.play(i + 1);
    }
    lastButtonStates[i] = current;
  }

  String state =
    String(u) + String(d) + String(l) + String(r) +
    String(b1) + String(b2) + String(b3) + String(b4) + String(b5);

  if (state != lastStateStr || millis() - lastSendTime > 2000) {
    sendControllerState(state);
    lastStateStr = state;
    lastSendTime = millis();
  }

  delay(5);
}
