# Connectivity Validation Helpers

These helpers let you fake enough cloud behavior locally to exercise ZPLC connectivity code without real Azure or AWS infrastructure.

## What This Covers

- `G7 Azure Event Grid`: validate MQTT 5 publish/subscribe behavior with a local broker.
- `G5 Azure DPS`: fake DPS register/poll responses over MQTT.
- `G6 AWS Fleet`: fake create-certificate and register-thing MQTT responses.

## Local Broker

If Docker works, use EMQX:

```bash
docker compose -f tools/connectivity/docker-compose.emqx.yml up -d
```

If Docker does **not** work, use the local Mosquitto broker already available on this machine:

```bash
mosquitto -c tools/connectivity/mosquitto.conf -v
```

EMQX dashboard:

- URL: `http://localhost:18083`
- user: `admin`
- password: `public`

## Python Dependencies

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r tools/connectivity/requirements.txt
```

This repo also works with:

```bash
python3 -m venv .venv-connectivity
source .venv-connectivity/bin/activate
pip install -r tools/connectivity/requirements.txt
```

## Fake Azure DPS

```bash
python3 tools/connectivity/fake_azure_dps.py --host 127.0.0.1 --port 1883 --assigned-hub fake-hub.azure-devices.net
```

Behavior:

- listens for `$dps/registrations/PUT/iotdps-register/#`
- replies with `202` and an `operationId`
- listens for poll topic
- replies with `200` and `assignedHub` + `deviceId`

## Fake AWS Fleet

```bash
python3 tools/connectivity/fake_aws_fleet.py --host 127.0.0.1 --port 1883 --template zplc-template
```

Behavior:

- listens for `$aws/certificates/create/json`
- returns fake `certificatePem`, `privateKey`, and `certificateOwnershipToken`
- listens for `$aws/provisioning-templates/{template}/provision/json`
- returns an accepted `thingName`

## Event Grid Inspector

```bash
python3 tools/connectivity/inspect_event_grid.py --host 127.0.0.1 --port 1883
```

Use this to inspect topic routing, payloads, and MQTT 5 properties for Event Grid profile testing.

## Configure The Board

Auto-detect the connected USB modem board and push local test config:

```bash
python3 tools/connectivity/configure_board.py event-grid
python3 tools/connectivity/configure_board.py dps --registration-id zplc-device
python3 tools/connectivity/configure_board.py fleet --template zplc-template
```

Run a one-off shell command on the board:

```bash
python3 tools/connectivity/board_shell.py zplc config show
```

The board scripts auto-detect `/dev/tty.usbmodem*` by default.

## Reality Check

These tools validate ZPLC-side topic flow and state transitions. They do **not** prove compatibility with real Azure DPS, real Azure Event Grid, or real AWS IoT Core. They are a local confidence step before real infrastructure testing.
