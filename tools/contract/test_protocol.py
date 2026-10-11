#!/usr/bin/env python3
"""Tests of the protocol definition and of its generator (COM-019, COM-029).

    python3 tools/contract/test_protocol.py

The definition is validated before anything is written, so a mistake in tools/contract/protocol.json stops the
generator with a sentence. The frames the codecs run are generated here by a third implementation: these tests
hold that implementation to the rules the definition states.
"""
from __future__ import annotations

import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import generate_protocol as gen  # noqa: E402


class DefinitionRules(unittest.TestCase):
    def setUp(self) -> None:
        self.p = gen.load()

    def invalid(self, change) -> str:
        broken = copy.deepcopy(self.p)
        change(broken)
        with self.assertRaises(gen.ProtocolError) as caught:
            gen.validate(broken)
        return str(caught.exception)

    def test_the_definition_is_valid(self) -> None:
        gen.validate(self.p)

    def test_two_messages_may_not_share_a_number(self) -> None:
        said = self.invalid(lambda p: p["messages"][1].update(id=p["messages"][0]["id"]))
        self.assertIn("duplicate message number", said)

    def test_a_request_number_is_below_128_and_an_event_number_is_not(self) -> None:
        self.assertIn("1 to 127", self.invalid(lambda p: p["messages"][0].update(id=200)))
        self.assertIn("128 to 255", self.invalid(lambda p: p["events"][0].update(id=0)))

    def test_a_tail_is_the_last_field(self) -> None:
        def move(p):
            fields = p["messages"][6]["request"]  # MEM_WRITE: address, data (tail)
            fields.reverse()
        self.assertIn("tail has to be the last", self.invalid(move))

    def test_an_unknown_access_or_enum_is_refused(self) -> None:
        self.assertIn("unknown access", self.invalid(lambda p: p["messages"][0].update(access="ANYONE")))
        self.assertIn("unknown enum", self.invalid(lambda p: p["messages"][0]["response"][1].update(enum="NOPE")))

    def test_the_header_fields_are_contiguous_and_add_up(self) -> None:
        self.assertIn("expected", self.invalid(lambda p: p["frame"]["header"][2].update(offset=9)))
        self.assertIn("add up", self.invalid(lambda p: p["frame"].update(headerBytes=12)))

    def test_the_default_payload_carries_the_largest_force(self) -> None:
        self.assertIn("largest force", self.invalid(lambda p: p["limits"].update(payloadMaxDefault=100)))

    def test_the_status_of_every_error_is_unique(self) -> None:
        self.assertIn("duplicate error value", self.invalid(lambda p: p["errors"][2].update(value=0)))


class ReferenceDecoder(unittest.TestCase):
    """The decoder that computes the expected results of the streams, against the rules written in the definition."""

    def setUp(self) -> None:
        self.p = gen.load()

    def frame(self, sequence: int = 1, payload: bytes = b"\x01\x00\x02") -> bytes:
        return gen.encode_frame(self.p, 0, 1, sequence, payload)

    def decode(self, data: bytes, payload_max: int = 512) -> gen.Decoder:
        decoder = gen.Decoder(self.p, payload_max)
        decoder.push(data)
        return decoder

    def test_a_frame_in_noise_is_found_and_the_noise_is_not_counted(self) -> None:
        decoder = self.decode(b"\x00\x5a\x5a\xff" + self.frame() + b"\xa5\x5a")
        self.assertEqual(len(decoder.frames), 1)
        self.assertEqual(decoder.counters["resyncs"], 0)

    def test_a_damaged_frame_costs_nothing_after_itself(self) -> None:
        bad = bytearray(self.frame(1))
        bad[-1] ^= 1
        decoder = self.decode(bytes(bad) + self.frame(2))
        self.assertEqual([f["sequence"] for f in decoder.frames], [2])
        self.assertEqual(decoder.counters["crc_errors"], 1)

    def test_a_frame_hidden_in_a_damaged_one_is_delivered(self) -> None:
        inner = self.frame(7)
        outer = bytearray(gen.encode_frame(self.p, 1, 3, 9, b"\xee" * 2 + inner))
        outer[-1] ^= 0xFF
        decoder = self.decode(bytes(outer))
        self.assertEqual([f["sequence"] for f in decoder.frames], [7])

    def test_the_cut_of_the_bytes_does_not_matter(self) -> None:
        data = b"\x01\x5a" + self.frame(1) + b"\x5a\xa5\x09" + self.frame(2)
        whole = self.decode(data)
        cut = gen.Decoder(self.p, 512)
        for byte in data:
            cut.push(bytes([byte]))
        self.assertEqual([f["wire"] for f in whole.frames], [f["wire"] for f in cut.frames])
        self.assertEqual(whole.counters, cut.counters)

    def test_the_limit_of_the_link_applies_to_the_announced_length(self) -> None:
        decoder = self.decode(self.frame(payload=b"x" * 40), payload_max=16)
        self.assertEqual(decoder.counters["oversize"], 1)
        self.assertEqual(decoder.frames, [])


class Outputs(unittest.TestCase):
    def test_the_committed_files_are_what_the_generator_writes(self) -> None:
        for path, text in gen.outputs().items():
            self.assertTrue(path.exists(), path)
            self.assertEqual(path.read_text(encoding="utf-8"), text, f"{path} is stale")

    def test_every_message_has_a_request_and_a_response_frame(self) -> None:
        vectors = gen.build_vectors(gen.load())
        names = {f["name"] for f in vectors["frames"]}
        for message in gen.load()["messages"]:
            self.assertIn(f"{message['name'].lower()}_request", names)
            self.assertIn(f"{message['name'].lower()}_response", names)

    def test_the_authenticated_frames_carry_a_code_under_the_test_key(self) -> None:
        import hashlib
        import hmac
        vectors = gen.build_vectors(gen.load())
        frame = [f for f in vectors["frames"] if f["name"] == "run_request_authenticated"][0]
        wire = bytes.fromhex(frame["wire"])
        covered, mac = wire[:-36], wire[-36:-4]
        self.assertEqual(mac, hmac.new(gen.KEY, covered, hashlib.sha256).digest())
        self.assertEqual(wire[3] & 4, 4)


if __name__ == "__main__":
    unittest.main()
