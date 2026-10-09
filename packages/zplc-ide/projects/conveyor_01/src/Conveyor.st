(*
 * Conveyor 01 - start/stop, jam fault with reset, and a metal-part diverter.
 * A logical model for the host-native simulator, not a physical conveyor.
 *
 * Inputs are active-high here: TRUE means the condition is present (Stop pressed, jam seen). That keeps the lesson
 * readable, but a real installation wires Stop and the jam sensor normally closed and models a signal that is TRUE while
 * healthy, so that a broken wire reads as "stop" or "jam" instead of as "all clear".
 *
 * The rule this program enforces: the belt only starts from a fresh Start press. Stop, a jam or a Reset must never start
 * the belt by themselves, even when the Start button is still held down. That is why Start has to be released after
 * each of them (StartArmed below) before it counts again.
 *)

PROGRAM Conveyor

VAR_INPUT
    Start AT %I0.0 : BOOL;
    Stop AT %I0.1 : BOOL;
    Reset AT %I0.2 : BOOL;
    PartAtClassifier AT %I0.3 : BOOL;
    MetalDetected AT %I0.4 : BOOL;
    PartAtDiverter AT %I0.5 : BOOL;
    JamDetected AT %I0.6 : BOOL;
END_VAR

VAR
    Requested : BOOL := FALSE;      (* the operator wants the belt running; cleared by Stop and by a jam *)
    Faulted : BOOL := FALSE;        (* jam latch: stays TRUE after the jam clears, until Reset *)
    (* TRUE while a Start press may run the belt. It is TRUE at power-up, so a Start that is already held when the program
       starts still runs the belt (motor_start_stop starts disarmed instead, the safer choice for real motion). Stop and a
       jam clear it; it comes back only when Start has been seen released while no fault is latched. *)
    StartArmed : BOOL := TRUE;
    MetalLatched : BOOL := FALSE;   (* a metal part was seen at the classifier and has not reached the diverter yet *)
END_VAR

VAR_OUTPUT
    BeltCommand AT %Q0.0 : BOOL;
    DiverterCommand AT %Q0.1 : BOOL;
    FaultLamp AT %Q0.2 : BOOL;
END_VAR

(* Request handling. A jam wins over everything: latch the fault, drop the request and disarm Start. *)
IF JamDetected THEN
    Faulted := TRUE;
    Requested := FALSE;
    StartArmed := FALSE;
ELSIF Stop THEN
    Requested := FALSE;
    StartArmed := FALSE;
ELSIF NOT Start THEN
    (* Start is released: the next press is a new request, but not while a fault is still latched. *)
    StartArmed := NOT Faulted;
ELSIF StartArmed AND NOT Faulted THEN
    Requested := TRUE;
END_IF;

(* Reset clears the latch only once the jam itself is gone. It does not restart the belt: StartArmed is still FALSE, and
   stays FALSE until the operator releases Start and presses it again. *)
IF Reset AND NOT JamDetected THEN
    Faulted := FALSE;
END_IF;

IF PartAtClassifier AND MetalDetected THEN
    MetalLatched := TRUE;
END_IF;

BeltCommand := Requested AND NOT Faulted;
DiverterCommand := BeltCommand AND PartAtDiverter AND MetalLatched;
FaultLamp := Faulted OR JamDetected;

(* The metal memory is for one part: forget it at the diverter, and on Stop, a jam or Reset, so that a part left on the
   belt is not diverted by a stale classification. It is cleared after the outputs above, so DiverterCommand still sees it
   in the scan where the part arrives. *)
IF PartAtDiverter OR Stop OR JamDetected OR Reset THEN
    MetalLatched := FALSE;
END_IF;

END_PROGRAM
