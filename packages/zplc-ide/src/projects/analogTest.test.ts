import { describe, expect } from 'bun:test';
import { fileURLToPath } from 'node:url';

import { createNativeScenarioSession } from '../cli/nativeScenarioRuntime';
import { itNative, nativeRuntimeBinary } from '../cli/nativeRuntimeGuard';
import { compilerCompile } from '../cli/toolApi';

// analog_test reads the RP2040 internal temperature sensor. The scenario language only drives BOOL signals, so this file
// drives the 12-bit ADC word itself, through the same native runtime the scenarios use, and reads the result back from
// the output image. Where things live (firmware/lib/zplc_core/src/hal/zephyr/zplc_scheduler_zephyr.c): ADC channel n is
// stored at input-image byte 8 + 2n, which is word %IW(4 + n); channel 4 (the temperature sensor) is therefore %IW8, byte 16.
const project = fileURLToPath(new URL('../../projects/analog_test', import.meta.url));
const ADC_CH4_BYTE = 16; // %IW8
const OPI = 0x1000;
const TEMP_C_BYTE = 8; // %QW4: the analog results sit clear of the four digital output bits in byte 0
const SENSOR_FAULT = { byte: 0, bit: 0 }; // %Q0.0

// The documented conversion, in the integer arithmetic the program uses (truncating division, like the VM).
const expectedTempC = (raw: number): number => {
  const millivolts = Math.trunc((raw * 3300) / 4096);
  return 27 - Math.trunc(((millivolts - 706) * 1000) / 1721);
};
const plausible = (celsius: number): boolean => celsius >= -40 && celsius <= 125;

describe('analog_test conversion on the native runtime', () => {
  const readings = [0, 1, 400, 800, 876, 900, 1000, 1100, 4095];

  itNative(
    'publishes the converted temperature and keeps the fault flag apart from the value',
    async () => {
      const previous = process.env.ZPLC_NATIVE_SIM_BIN;
      process.env.ZPLC_NATIVE_SIM_BIN = nativeRuntimeBinary;
      try {
        const built = await compilerCompile(project);
        if (!built.ok) throw new Error(JSON.stringify(built.evidence.diagnostics));
        const results: Array<{ raw: number; tempC: number; fault: boolean }> = [];
        for (const raw of readings) {
          const session = await createNativeScenarioSession(process.env);
          try {
            await session.runtime.loadProgram(built.zplcFile!);
            await session.runtime.reset();
            for (let bit = 0; bit < 16; bit++) await session.runtime.setInput(ADC_CH4_BYTE + (bit >> 3), bit & 7, ((raw >> bit) & 1) === 1);
            await session.runtime.step(0);
            await session.runtime.step(100);
            let word = 0;
            for (let bit = 0; bit < 16; bit++)
              if (await session.runtime.readOutput(OPI + TEMP_C_BYTE + (bit >> 3), bit & 7)) word |= 1 << bit;
            const tempC = word >= 0x8000 ? word - 0x10000 : word;
            results.push({ raw, tempC, fault: await session.runtime.readOutput(OPI + SENSOR_FAULT.byte, SENSOR_FAULT.bit) });
          } finally {
            await session.close();
          }
        }
        expect(results).toEqual(readings.map((raw) => ({ raw, tempC: expectedTempC(raw), fault: !plausible(expectedTempC(raw)) })));
        // The two cases the old program got wrong: a reading of 0 is a fault (not a value), and the value is never a 999 sentinel.
        expect(results.find((result) => result.raw === 0)?.fault).toBe(true);
        expect(results.every((result) => result.tempC !== 999)).toBe(true);
      } finally {
        if (previous === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
        else process.env.ZPLC_NATIVE_SIM_BIN = previous;
      }
    },
    60_000,
  );
});
