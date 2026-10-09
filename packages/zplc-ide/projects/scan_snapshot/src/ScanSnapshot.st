(*
 * Scan Snapshot - what one PLC scan remembers.
 *
 * A PLC runs the program in scans: read the inputs, run the program from top to bottom, write the outputs. A VAR variable
 * keeps its value from one scan to the next, so Previous can hold the Button of the scan before.
 *
 * The order of the last three statements is the lesson. Delayed is copied from Previous BEFORE Previous is updated at the
 * bottom, so Delayed is the Button of the previous scan: one scan late. RisingPulse is Current AND NOT Delayed, which is
 * TRUE for exactly one scan, the scan in which Button changes from FALSE to TRUE. Move "Previous := Button;" above
 * "Delayed := Previous;" and Delayed would equal Current, so RisingPulse would never be TRUE.
 *)

PROGRAM ScanSnapshot

VAR_INPUT
    Button AT %I0.0 : BOOL;
END_VAR

VAR
    Previous : BOOL := FALSE;       (* the Button of the previous scan, updated last *)
END_VAR

VAR_OUTPUT
    Current AT %Q0.0 : BOOL;        (* Button in this scan *)
    Delayed AT %Q0.1 : BOOL;        (* Button in the previous scan *)
    RisingPulse AT %Q0.2 : BOOL;    (* TRUE for one scan when Button goes from FALSE to TRUE *)
END_VAR

Current := Button;
Delayed := Previous;                (* read the old value first *)
RisingPulse := Current AND NOT Delayed;
Previous := Button;                 (* only now remember this scan's value *)

END_PROGRAM
