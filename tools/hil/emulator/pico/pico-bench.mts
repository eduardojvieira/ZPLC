// The Raspberry Pi Pico of the emulated HIL bench: a Zephyr rpi_pico/rp2040 image of ZPLC in rp2040js.
//
//   tsx pico-bench.mts '<json config>'      (started by tools/hil/emulator/bench_emulated.py, not by hand)
//
// Config: { emu: ZPLC_EMU_DIR, flash: flash file, uf2?: image to write first, hooks: {name: address},
//           wiring: [[output gpio, input gpio], ...], pullups: [gpio, ...], cdcFd, rtuFd, log, realtime }
//
// - Flash: rp2040js has no SPI-NOR behind the SSI, so the image's flash_range_erase, flash_range_program and
//   flash_write_partial are intercepted at the pico-sdk API and applied with NOR semantics to the flash file, at once:
//   a kill is a power cut, and a new process on the same file is the next power-up.
// - USB CDC ACM (the shell) and UART1 (Modbus RTU, GP4/GP5) are bridged to host ptys whose master side is cdcFd and
//   rtuFd. The parent holds the slaves, so their paths outlive a power cycle.
// - Wiring: each output pin drives its input pin (a 1 kOhm loopback): low when the output is low, else high. Inputs
//   with no wire read their pull-up.
// - Control: JSON lines on stdin {id, cmd, ...}, answers {id, ...} and events {event, ...} as JSON lines on stdout:
//     now                       -> {now_ms}            simulated time
//     sleep {ms}                -> {now_ms}            answered when that much simulated time has passed
//     adc {ch, raw}             -> {}                  ADC input 0..4 gets raw 0..4095
//     pin {gpio, value}         -> {}                  drive an input pin (no wire on it)
//     wire {pairs}              -> {}                  connect output -> input pairs (the bench wiring step)
//     pins                      -> {levels, funcsel}   output levels and function selects of GP0..GP29
//     cut {at_ms?}              -> {}                  power cut at that simulated time (now when absent)
//   events: ready (USB enumerated), shell (its prompt was printed), settled (then quiet for 300 ms), pin {gpio, level, t_ms} on every output change, watchdog (then the process ends, a reset).
import { createReadStream, createWriteStream, existsSync, openSync, readFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const config = JSON.parse(process.argv[2]);
const rp = join(config.emu, 'rp2040js');
const { Simulator } = await import(join(rp, 'src/simulator.ts'));
const { USBCDC } = await import(join(rp, 'src/usb/cdc.ts'));
const { ConsoleLogger, LogLevel } = await import(join(rp, 'src/utils/logging.ts'));
const { bootromB1 } = await import(join(rp, 'demo/bootrom.ts'));
const { loadUF2 } = await import(join(rp, 'demo/load-flash.ts'));

const FLASH_SIZE = 2 * 1024 * 1024; // the Pico's W25Q16
const sim = new Simulator();
const mcu = sim.rp2040;
mcu.loadBootrom(bootromB1);
mcu.logger = new ConsoleLogger(LogLevel.Error);
const log = createWriteStream(config.log, { flags: 'a' });
const nowMs = () => sim.clock.nanos / 1e6;
const emit = (message: object) => process.stdout.write(JSON.stringify(message) + '\n');
// process.exit() waits for the thread pool, where the reads of the ptys block forever: the end is always a kill,
// which is also what a power cut is. The flash file already holds every write.
const die = () => process.kill(process.pid, 'SIGKILL');
// A pty master is no tty to libuv (uv_tty_init fails on it): read it in the thread pool, write it at once.
const ptyReader = (fd: number) => createReadStream('', { fd, autoClose: false, highWaterMark: 4096 });
const ptyWrite = (fd: number, data: Uint8Array) => { writeSync(fd, data); };

// ---------------------------------------------------------------- flash, persisted at once
if (!existsSync(config.flash)) writeSync(openSync(config.flash, 'w'), new Uint8Array(FLASH_SIZE).fill(0xff));
mcu.flash.set(readFileSync(config.flash).subarray(0, FLASH_SIZE), 0);
const flashFd = openSync(config.flash, 'r+');
const persist = (offset: number, length: number) => writeSync(flashFd, mcu.flash, offset, length, offset);
if (config.uf2) {
  loadUF2(config.uf2, mcu); // like the UF2 bootloader: only the image's blocks change, the storage partition stays
  persist(0, FLASH_SIZE);
  log.write(`[bench] ${config.uf2} written to ${config.flash}\n`);
}
const r = mcu.core.registers;
const returnFromHook = () => { mcu.core.PC = r[14] & ~1; };
const program = (offset: number, source: number, length: number) => {
  for (let i = 0; i < length; i++) mcu.flash[offset + i] &= mcu.readUint8(source + i);
  persist(offset, length);
};
const hooks = new Map<number, () => void>([
  [config.hooks.flash_range_erase, () => { mcu.flash.fill(0xff, r[0], r[0] + r[1]); persist(r[0], r[1]); }],
  [config.hooks.flash_range_program, () => program(r[0], r[1], r[2])],
  [config.hooks.flash_write_partial, () => program(r[0], r[1], r[2])],
]);
const execute = mcu.core.executeInstruction.bind(mcu.core);
mcu.core.executeInstruction = () => {
  const hook = hooks.get(mcu.core.PC);
  if (!hook) return execute();
  hook();
  returnFromHook();
  return 1;
};

// ---------------------------------------------------------------- pins and the bench wiring
const wires = new Map<number, number>(); // output gpio -> input gpio
const outputLevel = new Map<number, number>();
const LOW = 0;
const HIGH = 1;
const wire = (pairs: number[][]) => {
  for (const [output, input] of pairs) {
    wires.set(output, input);
    mcu.gpio[input].setInputValue(outputLevel.get(output) !== LOW);
  }
};
for (const gpio of config.pullups) mcu.gpio[gpio].setInputValue(true); // switch open, pulled up
for (let gpio = 0; gpio < 30; gpio++) {
  mcu.gpio[gpio].addListener((state: number) => {
    const level = state === LOW ? LOW : state === HIGH ? HIGH : -1; // -1: not driven
    if (outputLevel.get(gpio) === level) return;
    outputLevel.set(gpio, level);
    const input = wires.get(gpio);
    if (input !== undefined) mcu.gpio[input].setInputValue(level !== LOW);
    emit({ event: 'pin', gpio, level, t_ms: nowMs() });
  });
}
wire(config.wiring);

// ---------------------------------------------------------------- watchdog, UART0 log, UART1 (Modbus RTU) bridge
(mcu.peripherals[0x40058] as { onWatchdogTrigger: () => void }).onWatchdogTrigger = () => {
  // rp2040js does not reset the chip: the bench starts a new process on the same flash file
  emit({ event: 'watchdog', t_ms: nowMs() });
  die();
};
mcu.uart[0].onByte = (byte: number) => log.write(String.fromCharCode(byte));
mcu.uart[1].onByte = (byte: number) => ptyWrite(config.rtuFd, Uint8Array.of(byte));
ptyReader(config.rtuFd).on('data', (data: string | Buffer) => { for (const byte of Buffer.from(data)) mcu.uart[1].feedByte(byte); });

// ---------------------------------------------------------------- USB CDC bridge (the shell)
const cdc = new USBCDC(mcu.usbCtrl);
cdc.onDeviceConnected = () => emit({ event: 'ready', t_ms: nowMs() });
let shellTail: string | null = ''; // the shell has started when its prompt is printed: commands sent before that are lost
cdc.onSerialData = (data: Uint8Array) => {
  ptyWrite(config.cdcFd, data);
  lastOutput = nowMs();
  if (shellTail === null) return;
  shellTail = (shellTail + Buffer.from(data).toString('latin1')).slice(-64);
  if (shellTail.includes('zplc:~$')) {
    shellTail = null;
    emit({ event: 'shell', t_ms: nowMs() });
    settle();
  }
};
// The boot is over when the shell has been quiet for 300 ms: the boot messages it prints would otherwise interleave
// with the first answers, which a person waiting for the board to restart never sees.
let lastOutput = 0;
const settle = () => {
  const quietMs = nowMs() - lastOutput;
  if (quietMs >= 300) return emit({ event: 'settled', t_ms: nowMs() });
  sim.clock.createAlarm(settle).schedule((300 - quietMs) * 1e6);
};
// A real host sends an OUT packet only when it has data; rp2040js's USBCDC answers every armed OUT buffer at once,
// with a zero-length packet when its FIFO is empty, and Zephyr's CDC ACM re-arms: an interrupt storm. Hold the read.
let pendingRead: number | null = null;
const outEndpoint = () => (cdc as unknown as { outEndpoint: number }).outEndpoint;
const completeRead = () => {
  if (pendingRead === null || cdc.txFIFO.itemCount === 0) return;
  const chunk = new Uint8Array(Math.min(pendingRead, cdc.txFIFO.itemCount));
  for (let i = 0; i < chunk.length; i++) chunk[i] = cdc.txFIFO.pull();
  pendingRead = null;
  mcu.usbCtrl.endpointReadDone(outEndpoint(), chunk);
};
mcu.usbCtrl.onEndpointRead = (endpoint: number, size: number) => {
  if (endpoint !== outEndpoint()) return;
  pendingRead = size;
  completeRead();
};
ptyReader(config.cdcFd).on('data', (data: string | Buffer) => {
  for (const byte of Buffer.from(data)) cdc.sendSerialByte(byte);
  completeRead();
});

// ---------------------------------------------------------------- control channel
const powerCut = () => {
  log.write(`\n[bench] power cut at ${nowMs().toFixed(3)} ms\n`);
  die();
};
const at = (ms: number, callback: () => void) => sim.clock.createAlarm(callback).schedule(Math.max(0, ms - nowMs()) * 1e6);
createInterface({ input: process.stdin }).on('line', (line: string) => {
  const { id, cmd, ...args } = JSON.parse(line);
  const answer = (body: object = {}) => emit({ id, ...body });
  switch (cmd) {
    case 'now': return answer({ now_ms: nowMs() });
    case 'sleep': return at(nowMs() + args.ms, () => answer({ now_ms: nowMs() }));
    case 'adc': mcu.adc.channelValues[args.ch] = args.raw; return answer();
    case 'pin': mcu.gpio[args.gpio].setInputValue(!!args.value); return answer();
    case 'wire': wire(args.pairs); return answer();
    case 'pins': return answer({
      levels: Object.fromEntries(outputLevel),
      funcsel: mcu.gpio.slice(0, 30).map((pin: { functionSelect: number }) => pin.functionSelect),
    });
    case 'cut':
      answer();
      if (args.at_ms === undefined || args.at_ms <= nowMs()) return powerCut();
      return at(args.at_ms, powerCut);
    default: return answer({ error: `unknown command ${cmd}` });
  }
});
process.stdin.on('end', die); // the bench went away

// ---------------------------------------------------------------- run, never ahead of the wall clock
// Host programs (the device link, a Modbus RTU endpoint) answer in wall time; an idle core would otherwise jump its
// clock ahead and time out on them. When the emulator is slower than the chip, simulated time falls behind instead.
const CYCLE_NS = 1e9 / 125_000_000;
const wallStart = performance.now();
const simStart = sim.clock.nanos;
const aheadMs = () => (sim.clock.nanos - simStart) / 1e6 - (performance.now() - wallStart);
const run = () => {
  const ahead = config.realtime ? aheadMs() : 0;
  if (ahead > 1) return void setTimeout(run, Math.min(ahead, 20));
  for (let i = 0; i < 200_000; i++) {
    if (mcu.core.waiting) {
      const skip = sim.clock.nanosToNextAlarm;
      sim.clock.tick(skip);
      i += skip / CYCLE_NS;
      if (config.realtime && aheadMs() > 1) break;
    } else {
      sim.clock.tick(mcu.core.executeInstruction() * CYCLE_NS);
    }
  }
  setImmediate(run);
};
mcu.core.PC = 0x10000000;
run();
