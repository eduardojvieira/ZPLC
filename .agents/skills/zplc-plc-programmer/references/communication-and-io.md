# Communication, I/O and forces

What exists, and at which level. State the level in every report.

- **Pins:** `firmware/app/boards/boards.json` is the one source of the channels,
  addresses, pins and safe values of a board. A variable located where the board has no
  channel is a build error naming the board; `io.virtual` lists addresses that no pin
  drives. The task page is `docs/docs/guides/map-io.md`.
- **Modbus, MQTT, Sparkplug B and the cloud blocks:** the pages under
  `docs/docs/guides/` state the contract of this release and mark what is unstable.
  Verified on the host and `native_sim` only: framing and mapping, handlers against
  stand-ins and hostile input. No exchange with a device, a broker or a cloud service is
  recorded, and no cloud block was verified against a service, an emulator or a
  recorded exchange.
- **Authority:** no message from a network changes RUN/STOP, sets or clears a force, or
  downloads a program (`docs/docs/runtime/connectivity.md`). A write goes through the
  exchange and respects forces.
- **Forces:** an agent never forces a value. `docs/docs/guides/force-values.md` says what
  a force does and what clears it.
- **Hardware records:** made by a person, bound to a firmware commit and image hash.
  `docs/docs/tutorials/first-board.md` lists the steps and says that nobody has executed
  them on a board.
