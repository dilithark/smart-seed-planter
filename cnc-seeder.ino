// SeedSow - ESP32 WebSocket side for seedsow-dashboard.html
// Libraries: ESPAsyncWebServer + AsyncTCP (ESP32Async versions), ArduinoJson v7
// Hook your real Motion / Vacuum / Water / Planting modules into the TODO spots.

#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <ArduinoJson.h>

const char* WIFI_SSID = "YOUR_WIFI";
const char* WIFI_PASS = "YOUR_PASSWORD";

AsyncWebServer server(80);
AsyncWebSocket ws("/ws");

// ---- machine state shared with the planting controller ----
String state = "IDLE";   // IDLE HOMING PICKING MOVING PLANTING WATERING PAUSED DONE ESTOP ERROR
int rows = 4, cols = 6, row = 0, col = 0, done = 0, total = 24;
float depthMm = 8, waterMl = 5;
float posX = 0, posY = 0, posZ = 0;
bool tankLow = false, hopperEmpty = false, trayPresent = true, estop = false, vacuumOn = false, pumpOn = false;

void sendStatus() {
  JsonDocument d;
  d["type"] = "status";
  d["state"] = state;
  d["rows"] = rows;   d["cols"] = cols;
  d["row"] = row;     d["col"] = col;
  d["done"] = done;   d["total"] = total;
  d["tankLow"] = tankLow;
  d["hopperEmpty"] = hopperEmpty;
  d["trayPresent"] = trayPresent;
  d["estop"] = estop;
  d["vacuum"] = vacuumOn;
  d["pump"] = pumpOn;
  d["x"] = posX; d["y"] = posY; d["z"] = posZ;
  String out; serializeJson(d, out);
  ws.textAll(out);
}

void handleCommand(JsonDocument& d) {
  String cmd = d["cmd"] | "";
  if (cmd == "hello") { sendStatus(); return; }

  if (cmd == "estop") {
    estop = true; state = "ESTOP";
    // TODO: disable steppers, vacuum, pump immediately
  } else if (cmd == "start" && (state == "IDLE" || state == "DONE") && !estop) {
    rows = d["rows"] | rows;  cols = d["cols"] | cols;
    depthMm = d["depth"] | depthMm;  waterMl = d["water"] | waterMl;
    total = rows * cols; done = 0; row = col = 0;
    state = "HOMING";
    // TODO: start planting task (home -> generate coordinates -> loop over pots)
  } else if (cmd == "pause" && state != "IDLE" && state != "DONE") {
    state = "PAUSED";   // TODO: remember previous step
  } else if (cmd == "resume" && state == "PAUSED") {
    state = "MOVING";   // TODO: restore previous step
  } else if (cmd == "stop") {
    state = "IDLE";     // TODO: abort task, stop actuators
  } else if (cmd == "home" && (state == "IDLE" || state == "DONE")) {
    state = "HOMING";   // TODO: home X, Y, Z, then state = "IDLE"
  } else if (cmd == "reset") {
    estop = false; state = "IDLE"; done = 0; row = col = 0;  // TODO: only if e-stop button released
  }
  sendStatus();
}

void onWsEvent(AsyncWebSocket*, AsyncWebSocketClient*, AwsEventType type, void* arg, uint8_t* data, size_t len) {
  if (type == WS_EVT_CONNECT) {
    sendStatus();
  } else if (type == WS_EVT_DATA) {
    AwsFrameInfo* info = (AwsFrameInfo*)arg;
    if (info->final && info->index == 0 && info->len == len && info->opcode == WS_TEXT) {
      JsonDocument d;
      if (!deserializeJson(d, data, len)) handleCommand(d);
    }
  }
}

void setup() {
  Serial.begin(115200);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) { delay(300); Serial.print('.'); }
  Serial.printf("\nIP address: %s\n", WiFi.localIP().toString().c_str());  // type this into the dashboard

  ws.onEvent(onWsEvent);
  server.addHandler(&ws);
  server.begin();
}

void loop() {
  static uint32_t last = 0;
  if (millis() - last > 500) {      // push live status twice a second
    last = millis();
    // TODO: read float sensor, IR sensors, e-stop pin, stepper positions here
    sendStatus();
  }
  ws.cleanupClients();
}
