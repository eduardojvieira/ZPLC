(*
 * Motor Plant - a start/stop request with speed feedback and a start-failure timeout.
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
 *
 * Start-failure timeout: a command that is not followed by AtSpeed must not stay energised for ever. If the motor has been
 * commanded for StartTimeout without reporting speed (or loses AtSpeed while running), the command is dropped and Fault is
 * latched. Only Stop clears Fault, and Start is ignored while it is set, so the motor never restarts by itself. The real
 * plant here reaches speed in 20 ms; set the timeout above the run-up time of the motor you drive.
 *)

PROGRAM MotorPlant

VAR_INPUT
    Start AT %I0.0 : BOOL;
    Stop AT %I0.1 : BOOL;
    AtSpeed AT %I0.2 : BOOL;        (* speed feedback; written by the plant, not by a person *)
END_VAR

VAR
    Requested : BOOL := FALSE;      (* start/stop memory: set by Start, cleared by Stop or by a start failure *)
    StartFailed : BOOL := FALSE;    (* latched when the feedback did not arrive in time *)
    StartTimer : TON;               (* runs while the motor is requested but not at speed *)
END_VAR

VAR_OUTPUT
    Command AT %Q0.0 : BOOL;        (* drive the motor *)
    Running AT %Q0.1 : BOOL;        (* requested and at speed *)
    Fault AT %Q0.2 : BOOL;          (* the motor did not reach speed in time; cleared by Stop *)
END_VAR

StartTimer(IN := Requested AND NOT AtSpeed, PT := T#1s);

IF Stop THEN
    Requested := FALSE;
    StartFailed := FALSE;
ELSIF StartTimer.Q THEN             (* commanded for the whole timeout and never at speed *)
    Requested := FALSE;
    StartFailed := TRUE;
ELSIF Start AND NOT StartFailed THEN
    Requested := TRUE;
END_IF;

Command := Requested;
Running := Requested AND AtSpeed;
Fault := StartFailed;

END_PROGRAM
