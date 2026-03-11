#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import time

import paho.mqtt.client as mqtt


FAKE_CERT = "-----BEGIN CERTIFICATE-----\nFAKE-ZPLC-CERT\n-----END CERTIFICATE-----\n"
FAKE_KEY = "-----BEGIN PRIVATE KEY-----\nFAKE-ZPLC-KEY\n-----END PRIVATE KEY-----\n"


class FakeAwsFleet:
    def __init__(self, broker_host: str, broker_port: int, template_name: str):
        self.broker_host = broker_host
        self.broker_port = broker_port
        self.template_name = template_name
        self.client = mqtt.Client(
            mqtt.CallbackAPIVersion.VERSION2, protocol=mqtt.MQTTv311
        )
        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message

    def on_connect(
        self, client: mqtt.Client, _userdata, _flags, reason_code, _properties
    ):
        if reason_code != 0:
            raise RuntimeError(f"AWS fleet fake broker connect failed: {reason_code}")
        client.subscribe("$aws/certificates/create/json", qos=0)
        client.subscribe(
            f"$aws/provisioning-templates/{self.template_name}/provision/json", qos=0
        )
        print("[fake-fleet] subscribed to create/provision topics")

    def publish(self, topic: str, payload: dict[str, object]) -> None:
        body = json.dumps(payload, separators=(",", ":"))
        self.client.publish(topic, body, qos=0, retain=False)
        print(f"[fake-fleet] -> {topic} {body}")

    def on_message(self, _client: mqtt.Client, _userdata, message: mqtt.MQTTMessage):
        topic = message.topic
        payload = message.payload.decode("utf-8", errors="ignore")
        print(f"[fake-fleet] <- {topic} {payload}")

        if topic == "$aws/certificates/create/json":
            token = f"ownership-{int(time.time())}"
            self.publish(
                "$aws/certificates/create/json/accepted",
                {
                    "certificateId": f"cert-{int(time.time())}",
                    "certificatePem": FAKE_CERT,
                    "privateKey": FAKE_KEY,
                    "certificateOwnershipToken": token,
                },
            )
            return

        if topic == f"$aws/provisioning-templates/{self.template_name}/provision/json":
            try:
                request = json.loads(payload or "{}")
            except json.JSONDecodeError:
                request = {}
            parameters = (
                request.get("parameters", {}) if isinstance(request, dict) else {}
            )
            thing_name = str(parameters.get("DeviceId") or f"zplc-{int(time.time())}")
            self.publish(
                f"$aws/provisioning-templates/{self.template_name}/provision/json/accepted",
                {
                    "thingName": thing_name,
                    "deviceConfiguration": {"broker": self.broker_host},
                },
            )

    def run(self) -> None:
        self.client.connect(self.broker_host, self.broker_port, keepalive=60)
        self.client.loop_forever()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=1883, type=int)
    parser.add_argument("--template", default="zplc-template")
    args = parser.parse_args()
    FakeAwsFleet(args.host, args.port, args.template).run()


if __name__ == "__main__":
    main()
