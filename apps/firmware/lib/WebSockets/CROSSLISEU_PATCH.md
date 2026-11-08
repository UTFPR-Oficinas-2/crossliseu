# arduinoWebSockets: Crossliseu patch

This folder is a modified copy of [links2004/arduinoWebSockets](https://github.com/Links2004/arduinoWebSockets) at tag **2.7.2** (`src/`, `LICENSE`, `library.json` only). It is licensed LGPL-2.1, like the original; the original `LICENSE` is kept unchanged. PlatformIO builds it from `lib/` instead of the registry, so it must **not** also be listed in `lib_deps`.

## Why

The arena box decides how to reconnect from the server's close code (`docs/arena-protocol.md`, "Close codes"): `4001`/`4004` retry every 60 s, `4003` stops until reboot, everything else uses backoff. Upstream 2.7.2:

1. reads the close code from the server's close frame only for its debug log (inside `#ifndef NODEBUG_WEBSOCKETS`) and then disconnects as if it were `1000`, so the app can never see it;
2. fires no event when the TCP/TLS connect itself fails, so an app that drives its own backoff cannot tell an attempt failed;
3. on ESP32 never sets a TLS handshake timeout, so a server that accepts TCP but stalls the handshake blocks `loop()` for the core's default 120 s.

## What changed

All changes are marked `// crossliseu:`.

- `WSclient_t` gets `uint16_t closeCode`.
- On a close frame, the code is always read and stored in `closeCode` (`1000` when the frame carries no code, as upstream logs it).
- `WebSocketsClient::lastCloseCode()` returns it. It is valid inside the `WStype_DISCONNECTED` callback; `0` means the connection ended without a close frame.
- `connectedCb()` resets `closeCode` to `0` at the start of each connection.
- `connectFailedCb()` resets `closeCode` to `0` and fires `WStype_ERROR` (payload `NULL`, length `0`).
- On ESP32, each `wss://` attempt sets a TLS handshake timeout of `WEBSOCKETS_TLS_HANDSHAKE_TIMEOUT_S` (default 10 s, defined in `WebSockets.h`).
- `library.json` version is `2.7.2-crossliseu.2`.

## Updating

To move to a newer upstream version: copy its `src/`, `LICENSE` and `library.json` over this folder in one commit, re-apply the diff below in a second commit, and check whether upstream now exposes the close code (then this patch can go).

## Diff against 2.7.2

```diff
diff --git a/apps/firmware/lib/WebSockets/src/WebSockets.cpp b/apps/firmware/lib/WebSockets/src/WebSockets.cpp
index 9b9ca8f..e027a08 100644
--- a/apps/firmware/lib/WebSockets/src/WebSockets.cpp
+++ b/apps/firmware/lib/WebSockets/src/WebSockets.cpp
@@ -499,12 +499,12 @@ void WebSockets::handleWebsocketPayloadCb(WSclient_t * client, bool ok, uint8_t
                 messageReceived(client, header->opCode, payload, header->payloadLen, header->fin);
                 break;
             case WSop_close: {
-#ifndef NODEBUG_WEBSOCKETS
+                // crossliseu: read the code outside NODEBUG_WEBSOCKETS and keep it for the client
                 uint16_t reasonCode = 1000;
                 if(header->payloadLen >= 2) {
                     reasonCode = payload[0] << 8 | payload[1];
                 }
-#endif
+                client->closeCode = reasonCode;
                 DEBUG_WEBSOCKETS("[WS][%d][handleWebsocket] get ask for close. Code: %d\n", client->num, reasonCode);
                 if(header->payloadLen > 2) {
                     DEBUG_WEBSOCKETS(" (%s)\n", (payload + 2));
diff --git a/apps/firmware/lib/WebSockets/src/WebSockets.h b/apps/firmware/lib/WebSockets/src/WebSockets.h
index 51ee3ef..0f0505c 100644
--- a/apps/firmware/lib/WebSockets/src/WebSockets.h
+++ b/apps/firmware/lib/WebSockets/src/WebSockets.h
@@ -125,6 +125,11 @@
 #define WEBSOCKETS_TCP_TIMEOUT (5000)
 #endif
 
+// crossliseu: TLS handshake timeout in seconds (ESP32 NetworkClientSecure::setHandshakeTimeout)
+#ifndef WEBSOCKETS_TLS_HANDSHAKE_TIMEOUT_S
+#define WEBSOCKETS_TLS_HANDSHAKE_TIMEOUT_S (10)
+#endif
+
 #define NETWORK_ESP8266_ASYNC (0)
 #define NETWORK_ESP8266 (1)
 #define NETWORK_W5100 (2)
@@ -413,6 +418,8 @@ typedef struct {
     uint8_t disconnectTimeoutCount = 0;    // after how many subsequent pong timeouts discconnect will happen, 0 means "do not disconnect"
     uint8_t pongTimeoutCount       = 0;    // current pong timeout count
 
+    uint16_t closeCode = 0;    // crossliseu: close code from the server's close frame, 0 when none arrived
+
 #if (WEBSOCKETS_NETWORK_TYPE == NETWORK_ESP8266_ASYNC)
     String cHttpLine;    ///< HTTP header lines
 #endif
diff --git a/apps/firmware/lib/WebSockets/src/WebSocketsClient.cpp b/apps/firmware/lib/WebSockets/src/WebSocketsClient.cpp
index c9d09e8..037c2d1 100644
--- a/apps/firmware/lib/WebSockets/src/WebSocketsClient.cpp
+++ b/apps/firmware/lib/WebSockets/src/WebSocketsClient.cpp
@@ -261,6 +261,11 @@ void WebSocketsClient::loop(void) {
             }
             _client.ssl = new WEBSOCKETS_NETWORK_SSL_CLASS();
             _client.tcp = _client.ssl;
+#if defined(ESP32)
+            // crossliseu: the connect timeout covers only TCP; without this a stalled TLS
+            // handshake blocks loop() for the core's default 120 s
+            _client.ssl->setHandshakeTimeout(WEBSOCKETS_TLS_HANDSHAKE_TIMEOUT_S);
+#endif
             if(_CA_cert) {
                 DEBUG_WEBSOCKETS("[WS-Client] setting CA certificate\n");
 #if defined(ESP32)
@@ -937,6 +942,7 @@ void WebSocketsClient::handleHeader(WSclient_t * client, String * headerLine) {
 
 void WebSocketsClient::connectedCb() {
     DEBUG_WEBSOCKETS("[WS-Client] connected to %s:%u.\n", _host.c_str(), _port);
+    _client.closeCode = 0;    // crossliseu: forget the previous connection's close code
 
 #if (WEBSOCKETS_NETWORK_TYPE == NETWORK_ESP8266_ASYNC)
     _client.tcp->onDisconnect(std::bind([](WebSocketsClient * c, AsyncTCPbuffer * obj, WSclient_t * client) -> bool {
@@ -987,6 +993,8 @@ void WebSocketsClient::connectedCb() {
 
 void WebSocketsClient::connectFailedCb() {
     DEBUG_WEBSOCKETS("[WS-Client] connection to %s:%u Failed\n", _host.c_str(), _port);
+    _client.closeCode = 0;                // crossliseu: a failed attempt has no close code
+    runCbEvent(WStype_ERROR, NULL, 0);    // crossliseu: let the app see a failed TCP/TLS connect
 }
 
 #if (WEBSOCKETS_NETWORK_TYPE == NETWORK_ESP8266_ASYNC)
diff --git a/apps/firmware/lib/WebSockets/src/WebSocketsClient.h b/apps/firmware/lib/WebSockets/src/WebSocketsClient.h
index 27acf62..1d22dfa 100644
--- a/apps/firmware/lib/WebSockets/src/WebSocketsClient.h
+++ b/apps/firmware/lib/WebSockets/src/WebSocketsClient.h
@@ -115,6 +115,12 @@ class WebSocketsClient : protected WebSockets {
     bool isConnected(void);
     String getUrl(void);
 
+    // crossliseu: close code sent by the server, valid inside the WStype_DISCONNECTED
+    // callback; 0 when the connection ended without a close frame (network loss, failed upgrade)
+    uint16_t lastCloseCode() const {
+        return _client.closeCode;
+    }
+
   protected:
     String _host;
     uint16_t _port;
```
