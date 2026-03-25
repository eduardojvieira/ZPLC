# Communication Function Blocks

This page describes the public communication FB contract that is visible in the current repo.

## Three layers define the surface

Communication FB behavior spans three different artifacts:

1. **compiler stdlib definitions** in `packages/zplc-compiler/src/compiler/stdlib/communication.ts`
2. **ISA opcodes** in `firmware/lib/zplc_core/include/zplc_isa.h`
3. **runtime dispatch kinds and status codes** in `firmware/lib/zplc_core/include/zplc_comm_dispatch.h`

## Common handshake model

The compiler stdlib defines a shared header for communication FBs with these fields:

- `EN`
- `BUSY`
- `DONE`
- `ERROR`
- `STATUS`

That is the right mental model for these blocks: they are asynchronous/stateful runtime interactions, not naive blocking calls.

## Dispatch model

At the ISA level, the repo currently exposes:

- `OP_COMM_EXEC`
- `OP_COMM_STATUS`
- `OP_COMM_RESET`

At the runtime dispatch level, the repo currently exposes communication kinds such as:

- `ZPLC_COMM_FB_MB_READ_HREG`
- `ZPLC_COMM_FB_MB_WRITE_HREG`
- `ZPLC_COMM_FB_MB_READ_COIL`
- `ZPLC_COMM_FB_MB_WRITE_COIL`
- `ZPLC_COMM_FB_MQTT_CONNECT`
- `ZPLC_COMM_FB_MQTT_PUBLISH`
- `ZPLC_COMM_FB_MQTT_SUBSCRIBE`
- cloud-wrapper kinds for Azure, AWS, and Sparkplug-related flows

## Compiler-visible FB set

The compiler stdlib currently registers these major FB families:

### Modbus

- `MB_READ_HREG`
- `MB_WRITE_HREG`
- `MB_READ_COIL`
- `MB_WRITE_COIL`

### MQTT

- `MQTT_CONNECT`
- `MQTT_PUBLISH`
- `MQTT_SUBSCRIBE`

### Cloud wrappers

- `AZURE_C2D_RECV`
- `AZURE_DPS_PROV`
- `AZURE_EG_PUB`
- `AWS_FLEET_PROV`
- `SPB_REBIRTH`

## Language parity expectation

These blocks are not supposed to be ST-only product features.

The release-facing contract is that the language surfaces converge on the same backend contract,
so communication FB claims should remain consistent across `ST`, `IL`, `LD`, `FBD`, and `SFC`.

## Release guidance

For v1.5.0, communication blocks are only honest release claims when these surfaces agree:

1. runtime behavior
2. compiler contract
3. IDE configuration/workflow
4. bilingual documentation and troubleshooting

If a block name exists in config or codegen but lacks reliable runtime behavior or release evidence,
document it carefully as in-progress or pending rather than pretending it is already signed off.
