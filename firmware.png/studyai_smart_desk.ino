// ================================================================
// StudyAI Smart Desk - Complete Cloud Firmware
// Target Board: ESP32 DevKit
// ================================================================

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

// ----------------------------------------------------------------
// 1. NETWORK & BACKEND CONFIGURATION
// ----------------------------------------------------------------
const char* WIFI_SSID     = "YOUR_WIFI_NAME";        // Replace with your Wi-Fi Name
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";    // Replace with your Wi-Fi Password

// Replace with your actual Render URL or local IP (e.g. http://192.168.1.50:5000/api/iot/telemetry)
const char* SERVER_URL    = "https://your-render-app-name.onrender.com/api/iot/telemetry";

// ----------------------------------------------------------------
// 2. HARDWARE PIN DEFINITIONS
// ----------------------------------------------------------------
#define PIR_PIN       26    // HC-SR501 PIR motion sensor
#define SOUND_PIN     27    // LM393 Digital sound sensor (DO)
#define BUZZER_PIN    25    // Active buzzer

#define PIR_ACTIVE_STATE   HIGH  // PIR outputs HIGH on motion
#define SOUND_ACTIVE_STATE LOW   // Sound sensor DO outputs LOW on noise

// Timing Parameters
const unsigned long SOUND_HOLD_TIME    = 800;   // Latch fast claps/snaps for 800ms
const unsigned long TELEMETRY_INTERVAL = 3000;  // Periodic cloud update every 3 seconds

// System State Variables
unsigned long lastSoundTriggerTime = 0;
unsigned long lastTelemetryTime    = 0;

bool previousMotionState = false;
bool previousSoundState  = false;

// ----------------------------------------------------------------
// Wi-Fi Connection Setup
// ----------------------------------------------------------------
void setupWiFi() {
  Serial.print("Connecting to Wi-Fi SSID: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\n[Wi-Fi Connected!]");
  Serial.print("ESP32 IP Address: ");
  Serial.println(WiFi.localIP());
}

// ----------------------------------------------------------------
// Send Telemetry JSON to Flask Backend
// ----------------------------------------------------------------
void sendTelemetry(bool motion, bool sound) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Wi-Fi lost! Attempting reconnection...");
    WiFi.reconnect();
    return;
  }

  WiFiClientSecure client;
  client.setInsecure(); // Bypass SSL certificate verification for cloud testing

  HTTPClient http;
  http.begin(client, SERVER_URL);
  http.addHeader("Content-Type", "application/json");

  // Construct JSON string matching backend expectations:
  // {"motion": true/false, "sound_interrupted": true/false}
  String jsonPayload = "{";
  jsonPayload += "\"motion\":" + String(motion ? "true" : "false") + ",";
  jsonPayload += "\"sound_interrupted\":" + String(sound ? "true" : "false");
  jsonPayload += "}";

  Serial.print("Posting Payload -> ");
  Serial.print(jsonPayload);

  int httpResponseCode = http.POST(jsonPayload);

  if (httpResponseCode > 0) {
    Serial.print(" | Server Response: ");
    Serial.println(httpResponseCode);
  } else {
    Serial.print(" | HTTP Error: ");
    Serial.println(http.errorToString(httpResponseCode).c_str());
  }

  http.end(); // Release network socket resources
}

// ----------------------------------------------------------------
// SETUP
// ----------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println(F("\n=============================================="));
  Serial.println(F("   StudyAI Smart Desk - IoT Hardware Client   "));
  Serial.println(F("=============================================="));

  pinMode(PIR_PIN, INPUT);
  pinMode(SOUND_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  setupWiFi();
}

// ----------------------------------------------------------------
// MAIN LOOP
// ----------------------------------------------------------------
void loop() {
  unsigned long currentMillis = millis();

  // 1. Read Raw Pin Inputs
  int rawPirVal   = digitalRead(PIR_PIN);
  int rawSoundVal = digitalRead(SOUND_PIN);

  bool motionDetected = (rawPirVal == PIR_ACTIVE_STATE);

  // 2. Pulse Latching for Fast Sound Spikes
  if (rawSoundVal == SOUND_ACTIVE_STATE) {
    lastSoundTriggerTime = currentMillis;
  }
  bool soundDetected = (currentMillis - lastSoundTriggerTime < SOUND_HOLD_TIME);

  // 3. Local Buzzer Feedback on Immediate Event Triggers
  if ((motionDetected && !previousMotionState) || (soundDetected && !previousSoundState)) {
    digitalWrite(BUZZER_PIN, HIGH);
    delay(80);
    digitalWrite(BUZZER_PIN, LOW);
  }

  // 4. Cloud Synchronization Trigger
  bool stateChanged = (motionDetected != previousMotionState) || (soundDetected != previousSoundState);
  bool timerExpired = (currentMillis - lastTelemetryTime >= TELEMETRY_INTERVAL);

  if (stateChanged || timerExpired) {
    lastTelemetryTime = currentMillis;
    sendTelemetry(motionDetected, soundDetected);
  }

  // Update previous states
  previousMotionState = motionDetected;
  previousSoundState  = soundDetected;
}