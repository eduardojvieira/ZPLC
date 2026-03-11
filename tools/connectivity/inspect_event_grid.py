#!/usr/bin/env python3
from __future__ import annotations

import argparse

import paho.mqtt.client as mqtt


def on_connect(client: mqtt.Client, _userdata, _flags, reason_code, _properties):
    if reason_code != 0:
        raise RuntimeError(f"event-grid inspector connect failed: {reason_code}")
    client.subscribe("#", qos=0)
    print("[event-grid-inspector] subscribed to #")


def on_message(_client: mqtt.Client, _userdata, message: mqtt.MQTTMessage):
    print(f"[event-grid-inspector] topic={message.topic}")
    if hasattr(message, "properties") and message.properties is not None:
        print(f"[event-grid-inspector] properties={message.properties}")
    print(message.payload.decode("utf-8", errors="ignore"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=1883, type=int)
    args = parser.parse_args()

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, protocol=mqtt.MQTTv5)
    client.on_connect = on_connect
    client.on_message = on_message
    client.connect(args.host, args.port, keepalive=60)
    client.loop_forever()


if __name__ == "__main__":
    main()
