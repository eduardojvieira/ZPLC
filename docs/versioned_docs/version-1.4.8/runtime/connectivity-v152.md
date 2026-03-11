# Connectivity v1_5_2 — Implementation Spec

**Phase:** v1_5_2  
**Status:** 🟡 In Progress  
**Scope:** All remaining in-scope protocol gaps from Phase 1_5 through 1_5_2, focused on Modbus client work and MQTT/cloud completion.

This document is the authoritative gap analysis and implementation contract for every connectivity feature that is **specified but not yet implemented** in the ZPLC runtime and IDE. It replaces `connectivity.md` as the canonical reference for this phase.

---

## 1. Gap Summary Table

| # | Feature | Layer | Priority | Effort | Dependency | Current Status |
|---|---------|-------|----------|--------|------------|----------------|
| G1 | Modbus RTU **Client** (Master) | Firmware + IDE | 🔴 High | M | None | 🟡 Partial - config/API/polling scaffold exists; tag model and production validation still missing |
| G2 | Modbus TCP **Client** (Master) | Firmware + IDE | 🔴 High | M | None | 🟡 Partial - client API and poll loop exist; persistent socket/gateway semantics still missing |
| G3 | Azure C2D Messaging | Firmware + IDE | 🔴 High | S | Azure IoT Hub ✅ | ✅ Implemented in runtime/config/UI |
| G4 | Sparkplug B Rebirth (NCMD/DCMD) | Firmware | 🔴 High | S | Sparkplug B ✅ | ✅ Implemented; NCMD pre-existed, DCMD rebirth added |
| G5 | Azure DPS (Device Provisioning) | Firmware + IDE | 🟡 Medium | L | Azure IoT Hub ✅ | 🟡 Partial - dedicated DPS MQTT connect/subscribe/register/poll loop exists, but needs compile validation and broker validation |
| G6 | AWS Fleet Provisioning | Firmware + IDE | 🟡 Medium | L | AWS IoT Core ✅ | 🟡 Partial - mutual-TLS MQTT exchange skeleton exists, but needs compile validation and broker validation |
| G7 | Azure Event Grid (full impl) | Firmware + IDE | 🟡 Medium | M | Azure IoT Hub ✅ | ✅ Implemented in runtime/config/UI, pending release validation |

**Effort key:** S = Small (less than 1 day), M = Medium (1–3 days), L = Large (3–7 days), XL = Extra Large (weeks)

### Release Reality Check (March 2026)

- The document originally assumed all items were still untouched. That is no longer true.
- The repo now contains firmware + IDE plumbing for the in-scope connectivity work.
- The real release blockers are the items still marked `Partial` in the table above.
- For release sign-off, `G5`, `G6`, and `G7` are the highest-risk gaps.

---

## 2. G1 — Modbus RTU Client (Master)

### Problem

`zplc_modbus.c` implements **only the server (slave) role** for both RTU and TCP. A real-world PLC must also act as a **Master**, actively polling sensors, drives, and third-party PLCs. Without client support, ZPLC cannot read a temperature sensor on a VFD, poll a remote I/O module, or cascade Modbus slaves.

Note: the server/slave role already exists in runtime. The remaining work in this phase is client/master completion, server hardening, and language-level helpers/visual blocks for server bindings.

### Spec (from `TECHNICAL_SPEC.md` Phase 1_5)

> **Modbus RTU (Server + Client)**: Uses Zephyr's native `CONFIG_MODBUS` subsystem. RS-485 half-duplex with automatic direction control. FC01–FC06, FC15–FC16.

### Firmware Implementation

**Current repo status:** `firmware/app/src/zplc_modbus_client.c` now exists and exposes the client API plus polling threads. What is still missing is a richer addressing/tag model (per-target slave metadata, multi-slave scheduling guarantees) and full HIL validation.

**Language support status:** the IDE/compiler pipeline now supports Modbus server binding helpers across ST, IL, LD, FBD, and SFC-generated ST using:

- `MODBUS_COIL(symbol, addr)`
- `MODBUS_DISCRETE_INPUT(symbol, addr)`
- `MODBUS_INPUT_REGISTER(symbol, addr)`
- `MODBUS_HOLDING_REGISTER(symbol, addr)`

Visual editors expose matching blocks:

- `MB_COIL`
- `MB_DISCRETE_INPUT`
- `MB_INPUT_REGISTER`
- `MB_HOLDING_REGISTER`

**New file:** `firmware/app/src/zplc_modbus_client.c`  
**New header additions to:** `firmware/app/include/zplc_config.h`

#### Config fields (new in `zplc_config.h`)

```c
/* Modbus Client Configuration */
bool zplc_config_get_modbus_rtu_client_enabled(void);
void zplc_config_set_modbus_rtu_client_enabled(bool enabled);

uint8_t zplc_config_get_modbus_rtu_client_slave_id(void);
void zplc_config_set_modbus_rtu_client_slave_id(uint8_t id);

uint32_t zplc_config_get_modbus_rtu_client_poll_ms(void);
void zplc_config_set_modbus_rtu_client_poll_ms(uint32_t ms);
```

#### Public API (new in `zplc_modbus.h` or `zplc_config.h`)

```c
/**
 * @brief Read holding registers from a remote Modbus RTU slave.
 *
 * Sends FC03. Blocks until response or timeout.
 *
 * @param slave_id  Target slave address (1–247).
 * @param start_reg First register address (0-based).
 * @param count     Number of 16-bit registers to read (1–1_5).
 * @param out       Output buffer — must hold count × 2 bytes.
 * @return 0 on success, negative Zephyr error code on failure.
 */
int zplc_modbus_rtu_client_read_holding(uint8_t slave_id, uint16_t start_reg,
                                        uint16_t count, uint16_t *out);

/**
 * @brief Write a single holding register to a remote Modbus RTU slave (FC06).
 */
int zplc_modbus_rtu_client_write_register(uint8_t slave_id, uint16_t reg,
                                          uint16_t value);

/**
 * @brief Write multiple holding registers (FC16).
 */
int zplc_modbus_rtu_client_write_multiple(uint8_t slave_id, uint16_t start_reg,
                                          uint16_t count, const uint16_t *values);

/**
 * @brief Read coils from a remote slave (FC01).
 */
int zplc_modbus_rtu_client_read_coils(uint8_t slave_id, uint16_t start_addr,
                                      uint16_t count, uint8_t *out_bits);

/**
 * @brief Write a single coil (FC05).
 */
int zplc_modbus_rtu_client_write_coil(uint8_t slave_id, uint16_t addr, bool state);
```

#### Thread model

- **Dedicated thread** `modbus_rtu_client` at `K_PRIO_PREEMPT(8)`, 2 KB stack.
- **Poll cycle** driven by `modbus_rtu_client_poll_ms` config value (default 100 ms).
- Uses Zephyr native `modbus_read_holding_regs()` / `modbus_write_holding_reg()` API via `CONFIG_MODBUS` client mode — **no raw UART byte-banging**.
- On each poll cycle: iterates the tag table looking for tags with `ZPLC_TAG_MODBUS` attribute and a `client_slave_id` field. Calls the appropriate FC and writes result into the Process Image via `zplc_pi_lock()`.
- Errors logged at `LOG_WRN` level; connection failures increment a retry counter with exponential backoff (max 10 s).

#### Kconfig

```kconfig
config ZPLC_MODBUS_RTU_CLIENT
    bool "Enable Modbus RTU Client (Master)"
    default n
    depends on MODBUS
    help
      Enables ZPLC to act as a Modbus RTU master, polling remote slaves.
```

---

## 3. G2 — Modbus TCP Client (Master)

### Problem

Same rationale as G1, over TCP/IP. Common scenario: ZPLC polls a remote Modbus TCP gateway, energy meter, or another PLC on the plant network.

### Spec (from `TECHNICAL_SPEC.md` Phase 1_5)

> **Modbus TCP (Server + Client)**: TCP listener on configurable port. Multiple simultaneous client connections. **Gateway mode: Modbus TCP ↔ RTU bridging**.

### Firmware Implementation

**Current repo status:** TCP client request helpers and polling threads now exist in `firmware/app/src/zplc_modbus_client.c`. The remaining gaps are persistent connection management, gateway mode, and release-grade reconnect/HIL validation.

**Added to:** `firmware/app/src/zplc_modbus_client.c` (same file as G1)

#### Config fields (new)

```c
bool zplc_config_get_modbus_tcp_client_enabled(void);
void zplc_config_set_modbus_tcp_client_enabled(bool enabled);

void zplc_config_get_modbus_tcp_client_host(char *buf, size_t len);
void zplc_config_set_modbus_tcp_client_host(const char *host);

uint16_t zplc_config_get_modbus_tcp_client_port(void);
void zplc_config_set_modbus_tcp_client_port(uint16_t port);

uint32_t zplc_config_get_modbus_tcp_client_poll_ms(void);
void zplc_config_set_modbus_tcp_client_poll_ms(uint32_t ms);

uint32_t zplc_config_get_modbus_tcp_client_timeout_ms(void);
void zplc_config_set_modbus_tcp_client_timeout_ms(uint32_t ms);
```

#### Public API

```c
/**
 * @brief Read holding registers from a remote Modbus TCP server (FC03).
 *
 * @param host      Target hostname or IPv4 string.
 * @param port      Target port (default 502).
 * @param unit_id   Modbus Unit ID (typically 1 for TCP-native devices, 0xFF for gateways).
 * @param start_reg First register address (0-based).
 * @param count     Number of 16-bit registers (1–1_5).
 * @param out       Output buffer — must hold count × 2 bytes.
 * @return 0 on success, negative error code on failure.
 */
int zplc_modbus_tcp_client_read_holding(const char *host, uint16_t port,
                                        uint8_t unit_id, uint16_t start_reg,
                                        uint16_t count, uint16_t *out);

int zplc_modbus_tcp_client_write_register(const char *host, uint16_t port,
                                          uint8_t unit_id, uint16_t reg,
                                          uint16_t value);

int zplc_modbus_tcp_client_write_multiple(const char *host, uint16_t port,
                                          uint8_t unit_id, uint16_t start_reg,
                                          uint16_t count, const uint16_t *values);

int zplc_modbus_tcp_client_read_coils(const char *host, uint16_t port,
                                      uint8_t unit_id, uint16_t start_addr,
                                      uint16_t count, uint8_t *out_bits);

int zplc_modbus_tcp_client_write_coil(const char *host, uint16_t port,
                                      uint8_t unit_id, uint16_t addr, bool state);
```

#### Thread model

- **Dedicated thread** `modbus_tcp_client` at `K_PRIO_PREEMPT(8)`, 3 KB stack.
- Maintains a **persistent TCP socket** to the configured host. Reconnects with exponential backoff on disconnect.
- **Transaction ID** counter (16-bit, wrapping) embedded in MBAP header.
- Response timeout configurable via `modbus_tcp_client_timeout_ms` (default 500 ms).
- Same Process Image integration as G1.

#### Kconfig

```kconfig
config ZPLC_MODBUS_TCP_CLIENT
    bool "Enable Modbus TCP Client (Master)"
    default n
    depends on NET_TCP
    help
      Enables ZPLC to act as a Modbus TCP master, connecting to remote servers.
```

---

## 4. G3 — Azure Cloud-to-Device (C2D) Messaging

### Problem

`zplc_mqtt.c` handles `ZPLC_MQTT_PROFILE_AZURE_IOT_HUB` and already subscribes to Device Twins and Direct Methods on CONNACK. **Cloud-to-Device messaging** (the third Azure IoT Hub primitive) is completely missing — there is no subscription to `devices/{deviceId}/messages/devicebound/#`.

### Spec (from `TECHNICAL_SPEC.md` Phase 1_5_1)

> **Azure IoT Hub**: Cloud-to-Device (C2D) messaging.

### Firmware Implementation

**Current repo status:** Implemented in `firmware/app/src/zplc_mqtt.c`, `firmware/app/src/zplc_config.c`, and the IDE settings/runtime provisioning path.

**Modified file:** `firmware/app/src/zplc_mqtt.c`

#### Required changes

1. **Subscribe on CONNACK** (add to the Azure IoT Hub `CONNACK` handler alongside the existing Twin/Methods subscriptions):
   ```c
   /* C2D topic */
   snprintf(s_c2d_topic, sizeof(s_c2d_topic),
            "devices/%s/messages/devicebound/#", client_id);
   zplc_mqtt_subscribe(s_c2d_topic, ZPLC_MQTT_QOS1);
   ```

2. **Dispatch in `PUBLISH` handler** (add a new `else if` branch to `zplc_mqtt_evt_handler`):
   ```c
   } else if (azure_hub_enabled &&
              strncmp(topic, "devices/", 8) == 0 &&
              strstr(topic, "/messages/devicebound/")) {
       /* C2D message received */
       LOG_INF("Azure C2D message received (%d bytes)", payload_len);
       if (s_c2d_callback) {
           s_c2d_callback(payload, payload_len);
       }
   }
   ```

3. **Callback registration API** (new):
   ```c
   typedef void (*zplc_azure_c2d_cb_t)(const uint8_t *payload, size_t len);
   void zplc_mqtt_set_azure_c2d_callback(zplc_azure_c2d_cb_t cb);
   ```

4. **Static buffer** for C2D topic: `static char s_c2d_topic[128]` (covers `devices/{64-char-id}/messages/devicebound/#`).

#### Config fields (new)

```c
bool zplc_config_get_azure_c2d_enabled(void);
void zplc_config_set_azure_c2d_enabled(bool enabled);
```

---

## 5. G4 — Sparkplug B Rebirth (NCMD / DCMD)

### Problem

The spec requires testing: *"Simulate Primary Application REBIRTH request, verify REBIRTH response"* (Phase 5.1 verification). Currently, `zplc_mqtt.c` publishes `NBIRTH` on connect but **never subscribes to `NCMD` or `DCMD` topics**, so a SCADA system (Ignition, HiveMQ) cannot trigger a Rebirth.

### Spec (from `TECHNICAL_SPEC.md` Phase 1_5_1)

> **MQTT Sparkplug B**: Birth/Death certificates for device lifecycle. Compatible with Ignition, HiveMQ, Cirrus Link.

### Firmware Implementation

**Current repo status:** `NCMD` rebirth support already existed in `firmware/app/src/zplc_mqtt.c`. `DCMD` rebirth handling was added afterward, so this gap is now closed.

**Modified file:** `firmware/app/src/zplc_mqtt.c`

#### Required changes

1. **Subscribe to NCMD on CONNACK** (after NBIRTH publish):
   ```c
   /* Sparkplug B: subscribe to node commands */
   snprintf(buf, sizeof(buf), "spBv1.0/%s/NCMD/%s", group_id, edge_node_id);
   zplc_mqtt_subscribe(buf, ZPLC_MQTT_QOS1);
   ```

2. **Handle NCMD in PUBLISH dispatcher**:
   ```c
   } else if (profile == ZPLC_MQTT_PROFILE_SPARKPLUG_B &&
              strstr(topic, "/NCMD/")) {
       /* Decode Sparkplug protobuf payload */
       Payload ncmd_payload = Payload_init_zero;
       /* ... nanopb decode ... */
       for each metric in ncmd_payload.metrics {
           if (strcmp(metric.name, "Node Control/Rebirth") == 0 &&
               metric.boolean_value == true) {
               LOG_INF("Sparkplug Rebirth requested — republishing NBIRTH");
               zplc_sparkplug_publish_birth();
           }
       }
   }
   ```

3. **Extract `zplc_sparkplug_publish_birth()`** as a standalone function (currently inlined in the CONNACK handler) so it can be called from the NCMD handler.

4. **DCMD support**: Same pattern, but subscribing to `spBv1.0/{group}/{DCMD}/{node}/{device}`. The `Device Control/Rebirth` metric triggers `zplc_sparkplug_publish_dbirth()`.

---

## 6. G5 — Azure Device Provisioning Service (DPS)

### Problem

Azure DPS allows zero-touch device onboarding: the device doesn't need to know its final IoT Hub hostname at compile time. It registers with DPS, receives its assigned Hub hostname, and then connects. This is **mandatory** for production fleet deployments. Currently absent.

### Spec (from `TECHNICAL_SPEC.md` Phase 1_5_1)

> **Azure IoT Hub**: Device Provisioning Service (DPS) support.

### Firmware Implementation

**Current repo status:** The repo now has config/UI plumbing, SAS generation, DPS topic parsing, and a dedicated MQTT registration/polling flow in `firmware/app/src/zplc_azure_dps.c`. Remaining work is compile validation and real-broker validation.

**New file:** `firmware/app/src/zplc_azure_dps.c`  
**New header:** `firmware/app/include/zplc_azure_dps.h`

#### Flow

```
1. Device calls zplc_azure_dps_provision()
2. Connect to {dps_endpoint} via MQTT/TLS
   - Broker: global.azure-devices-provisioning.net (port 8883)
   - Client ID: {registrationId}
   - Username: {idScope}/registrations/{registrationId}/api-version=2021-06-01
3. Subscribe: $dps/registrations/res/#
4. Publish to: $dps/registrations/PUT/iotdps-register/?$rid=1
   Payload: {"registrationId": "{registrationId}"}
5. Poll $dps/registrations/GET/iotdps-get-operationstatus/?$rid=2&operationId={opId}
   until status == "assigned"
6. Extract assigned.assignedHub from response JSON
7. Persist assigned hub hostname via zplc_config_set_mqtt_broker()
8. Disconnect from DPS, reconnect to IoT Hub
```

#### Config fields (new)

```c
bool zplc_config_get_azure_dps_enabled(void);
void zplc_config_set_azure_dps_enabled(bool enabled);

void zplc_config_get_azure_dps_id_scope(char *buf, size_t len);
void zplc_config_set_azure_dps_id_scope(const char *scope);    /* e.g. "0ne00ABCDEF" */

void zplc_config_get_azure_dps_registration_id(char *buf, size_t len);
void zplc_config_set_azure_dps_registration_id(const char *id);

void zplc_config_get_azure_dps_endpoint(char *buf, size_t len);
void zplc_config_set_azure_dps_endpoint(const char *ep);       /* default: global.azure-devices-provisioning.net */
```

#### Public API

```c
/**
 * @brief Trigger DPS provisioning flow.
 *
 * Blocks until assigned or timeout. On success, persists the assigned
 * IoT Hub hostname to NVS via zplc_config_set_mqtt_broker() and returns 0.
 *
 * @return 0 on success, -ETIMEDOUT if DPS does not respond within 30 s,
 *         -EACCES if DPS rejects registration.
 */
int zplc_azure_dps_provision(void);
```

---

## 7. G6 — AWS Fleet Provisioning

### Problem

AWS Fleet Provisioning allows devices to use a shared "claim certificate" at the factory, then exchange it for a unique device certificate during first boot. Without this, every ZPLC device needs a manually provisioned X.509 cert — impractical at scale.

### Spec (from `TECHNICAL_SPEC.md` Phase 1_5)

> **AWS IoT Core**: Fleet Provisioning: zero-touch device onboarding.

### Firmware Implementation

**Current repo status:** The repo now has config/UI plumbing, topic parsing, persistence helpers, a mutual-TLS MQTT exchange skeleton, and persisted-cert handoff via `persist://...` paths consumed by `firmware/app/src/zplc_mqtt.c`. Remaining work is compile validation and real-broker validation.

**New file:** `firmware/app/src/zplc_aws_fleet.c`  
**New header:** `firmware/app/include/zplc_aws_fleet.h`

#### Flow

```
1. Boot with "claim certificate" (factory-provisioned, shared across fleet)
2. Connect to AWS IoT Core with claim cert (TLS mutual auth)
3. Subscribe: $aws/certificates/create/json/accepted
               $aws/certificates/create/json/rejected
4. Publish to: $aws/certificates/create/json   (empty payload)
5. Receive certificateId + certificatePem + privateKey + certificateOwnershipToken
6. Persist new cert + key to NVS (zplc_hal_persist_save)
   - Runtime now supports `persist://aws_cert_pem` and `persist://aws_key_pem` in MQTT cert/key config paths
7. Subscribe: $aws/provisioning-templates/{templateName}/provision/json/accepted
               $aws/provisioning-templates/{templateName}/provision/json/rejected
8. Publish register thing: { "certificateOwnershipToken": "...", "parameters": {...} }
9. On accepted: device is provisioned — reconnect with new cert
   - Current code updates MQTT client cert/key paths to persisted cert material and disables fleet mode
10. Delete claim cert from NVS (it is single-use)
```

#### Config fields (new)

```c
bool zplc_config_get_aws_fleet_enabled(void);
void zplc_config_set_aws_fleet_enabled(bool enabled);

void zplc_config_get_aws_fleet_template_name(char *buf, size_t len);
void zplc_config_set_aws_fleet_template_name(const char *name);

void zplc_config_get_aws_claim_cert_path(char *buf, size_t len);
void zplc_config_set_aws_claim_cert_path(const char *path);

void zplc_config_get_aws_claim_key_path(char *buf, size_t len);
void zplc_config_set_aws_claim_key_path(const char *path);
```

#### Public API

```c
/**
 * @brief Trigger AWS Fleet Provisioning flow.
 *
 * Uses the configured claim certificate to obtain a unique device certificate
 * from AWS IoT Core. Persists the new certificate and private key to NVS.
 * Must be called once at first boot when device cert is not yet present.
 *
 * @return 0 on success, -EACCES if rejected, -ETIMEDOUT on timeout.
 */
int zplc_aws_fleet_provision(void);

/** @brief Returns true if device has been provisioned (unique cert present). */
bool zplc_aws_fleet_is_provisioned(void);
```

---

## 8. G7 — Azure Event Grid (Full Implementation)

### Problem

`ZPLC_MQTT_PROFILE_AZURE_EVENT_GRID = 4` exists in the profile enum and the IDE dropdown, but **zero logic** is wired to it. When selected, the firmware behaves identically to `GENERIC_BROKER` — no Event Grid-specific topic routing, no CloudEvents schema encoding.

### What Azure Event Grid MQTT requires

Azure Event Grid's MQTT broker (GA since 2024) uses standard MQTT 5.0 with:
- **Custom topics** (user-defined, not the `$iothub/` hierarchy)
- **CloudEvents schema** (`Content-Type: application/cloudevents+json; charset=utf-8`) for structured events
- **MQTT 5.0** with User Properties for CloudEvents attributes

### Firmware Implementation

**Current repo status:** Config/UI plumbing, CloudEvent JSON publish, Event Grid subscriptions, and MQTT 5 User Properties now exist in `firmware/app/src/zplc_mqtt.c`. The remaining work is release validation against a real broker.

**Modified file:** `firmware/app/src/zplc_mqtt.c`

#### New dispatch block in CONNACK handler

```c
} else if (profile == ZPLC_MQTT_PROFILE_AZURE_EVENT_GRID) {
    /* Azure Event Grid uses user-defined topics — no system subscriptions.
     * Subscribe to the configured topic_namespace for incoming commands. */
    char sub_topic[192];
    zplc_config_get_mqtt_topic_namespace(sub_topic, sizeof(sub_topic));
    strncat(sub_topic, "/commands/#", sizeof(sub_topic) - strlen(sub_topic) - 1);
    zplc_mqtt_subscribe(sub_topic, ZPLC_MQTT_QOS1);
    LOG_INF("Azure Event Grid: subscribed to %s", sub_topic);
}
```

#### CloudEvents publish helper

```c
/**
 * @brief Publish a CloudEvent to Azure Event Grid MQTT broker.
 *
 * Encodes payload as a JSON CloudEvent envelope and publishes with
 * MQTT 5.0 User Properties for CE attributes.
 *
 * @param event_type CE type attribute (e.g. "com.zplc.telemetry.v1")
 * @param source     CE source attribute (e.g. "/devices/{deviceId}")
 * @param topic      MQTT topic to publish to
 * @param data       JSON payload string (will be embedded as "data" field)
 * @return 0 on success, negative on error.
 */
int zplc_azure_event_grid_publish(const char *event_type,
                                  const char *source,
                                  const char *topic,
                                  const char *data);
```

#### Config fields (new)

```c
void zplc_config_get_azure_event_grid_topic(char *buf, size_t len);
void zplc_config_set_azure_event_grid_topic(const char *topic);

void zplc_config_get_azure_event_grid_source(char *buf, size_t len);
void zplc_config_set_azure_event_grid_source(const char *source);  /* e.g. "/devices/myPLC" */

void zplc_config_get_azure_event_grid_event_type(char *buf, size_t len);
void zplc_config_set_azure_event_grid_event_type(const char *type); /* e.g. "com.zplc.telemetry" */
```

---
