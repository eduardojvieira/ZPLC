(*
 * Motor Plant - a start/stop request with speed feedback.
 *
 * The scenario in tests/motor-plant.scenario.json runs this program against a built-in simulated motor named "motor-v1"
 * (src/test-engine/index.ts). That plant is not in this project's files, so this is what it does. Every 10 ms scan it
 * reads Command. While Command is TRUE its speed rises by 500 per mille per scan, up to 1000. While Command is FALSE it
 * falls by 1000 per mille per scan, that is, to 0 in one scan. AtSpeed is TRUE when the speed was 1000 at the start of the
 * scan, so the feedback arrives two scans after Command goes TRUE and drops one scan after Command goes FALSE.
 *
 * Command is the request, Running is the proof: Running is TRUE only while the motor is requested AND has reported speed.
 * Gating Running with Requested makes it fall in the same scan as a Stop instead of waiting for AtSpeed to fall.
 *
 * Start only needs a pulse because Requested remembers it until Stop. Stop wins over Start when both are TRUE.
 *)

PROGRAM MotorPlant

VAR_INPUT
    Start AT %I0.0 : BOOL;
    Stop AT %I0.1 : BOOL;
    AtSpeed AT %I0.2 : BOOL;        (* speed feedback; written by the plant, not by a person *)
END_VAR

VAR
    Requested : BOOL := FALSE;      (* start/stop memory: set by Start, cleared by Stop *)
END_VAR

VAR_OUTPUT
    Command AT %Q0.0 : BOOL;        (* drive the motor *)
    Running AT %Q0.1 : BOOL;        (* requested and at speed *)
END_VAR

IF Stop THEN
    Requested := FALSE;
ELSIF Start THEN
    Requested := TRUE;
END_IF;

Command := Requested;
Running := Requested AND AtSpeed;

END_PROGRAM
