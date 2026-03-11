#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import time
from dataclasses import dataclass
from urllib.parse import parse_qs, urlparse

import paho.mqtt.client as mqtt


@dataclass
class PendingRegistration:
    operation_id: str
    registration_id: str
    assigned_hub: str
    assigned_device_id: str
    created_at: float


class FakeAzureDps:
    def __init__(self, broker_host: str, broker_port: int, assigned_hub: str):
        self.broker_host = broker_host
        self.broker_port = broker_port
        self.assigned_hub = assigned_hub
        self.pending: dict[str, PendingRegistration] = {}
        self.client = mqtt.Client(
            mqtt.CallbackAPIVersion.VERSION2, protocol=mqtt.MQTTv311
        )
        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message

    def on_connect(
        self, client: mqtt.Client, _userdata, _flags, reason_code, _properties
    ):
        if reason_code != 0:
            raise RuntimeError(f"DPS fake broker connect failed: {reason_code}")
        client.subscribe("$dps/registrations/PUT/iotdps-register/#", qos=0)
        client.subscribe("$dps/registrations/GET/iotdps-get-operationstatus/#", qos=0)
        print("[fake-dps] subscribed to registration and poll topics")

    def publish(self, topic: str, payload: dict[str, object]) -> None:
        body = json.dumps(payload, separators=(",", ":"))
        self.client.publish(topic, body, qos=0, retain=False)
        print(f"[fake-dps] -> {topic} {body}")

    def handle_register(self, topic: str, payload: str) -> None:
        parsed = urlparse(topic.replace("?$", "?"))
        rid = parse_qs(parsed.query).get("rid", ["1"])[0]
        try:
            registration_payload = json.loads(payload or "{}")
        except json.JSONDecodeError:
            registration_payload = {}
        registration_id = str(
            registration_payload.get("registrationId") or "zplc-device"
        )
        operation_id = f"op-{rid}-{int(time.time())}"
        assigned_device_id = registration_id
        self.pending[operation_id] = PendingRegistration(
            operation_id=operation_id,
            registration_id=registration_id,
            assigned_hub=self.assigned_hub,
            assigned_device_id=assigned_device_id,
            created_at=time.time(),
        )
        response_topic = f"$dps/registrations/res/202/?$rid={rid}&retry-after=1"
        self.publish(
            response_topic, {"operationId": operation_id, "status": "assigning"}
        )

    def handle_poll(self, topic: str) -> None:
        parsed = urlparse(topic.replace("?$", "?"))
        query = parse_qs(parsed.query)
        rid = query.get("rid", ["2"])[0]
        operation_id = query.get("operationId", [""])[0]
        pending = self.pending.get(operation_id)
        if pending is None:
            self.publish(
                f"$dps/registrations/res/404/?$rid={rid}",
                {"errorCode": 404001, "message": "operationId not found"},
            )
            return
        response_topic = f"$dps/registrations/res/200/?$rid={rid}"
        self.publish(
            response_topic,
            {
                "operationId": operation_id,
                "status": "assigned",
                "registrationState": {
                    "assignedHub": pending.assigned_hub,
                    "deviceId": pending.assigned_device_id,
                    "status": "assigned",
                },
                "assignedHub": pending.assigned_hub,
                "deviceId": pending.assigned_device_id,
            },
        )

    def on_message(self, _client: mqtt.Client, _userdata, message: mqtt.MQTTMessage):
        topic = message.topic
        payload = message.payload.decode("utf-8", errors="ignore")
        print(f"[fake-dps] <- {topic} {payload}")
        if topic.startswith("$dps/registrations/PUT/iotdps-register/"):
            self.handle_register(topic, payload)
        elif topic.startswith("$dps/registrations/GET/iotdps-get-operationstatus/"):
            self.handle_poll(topic)

    def run(self) -> None:
        self.client.connect(self.broker_host, self.broker_port, keepalive=60)
        self.client.loop_forever()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=1883, type=int)
    parser.add_argument("--assigned-hub", default="fake-hub.azure-devices.net")
    args = parser.parse_args()
    FakeAzureDps(args.host, args.port, args.assigned_hub).run()


if __name__ == "__main__":
    main()
