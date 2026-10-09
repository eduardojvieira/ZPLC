(*
 * Tank Level Controller - fill pump with latched faults and an armed Reset.
 *
 * Filling: with AutoEnable on, LevelLow starts a fill and the pump is latched on (PumpLatched), because LevelLow goes
 * FALSE as soon as the level rises. LevelHigh, or AutoEnable going off, ends the fill.
 *
 * Faults: EStop or PumpFault switch the pump off at once and latch FaultLatched, which keeps Alarm on and the pump off
 * after the input itself has gone away. The fault inputs are active-high here (TRUE = fault); a real installation wires
 * them normally closed and models a signal that is TRUE while healthy, so that a broken wire reads as a fault.
 *
 * Reset is armed: it clears the latch only if it was seen released after the fault, and only while neither fault input is
 * present. A Reset held down through the fault, or pressed while EStop is still pressed, does nothing; the operator
 * releases it and presses it again.
 *
 * Restart after a reset is automatic: once FaultLatched is cleared, AutoEnable still on and the tank still low start the
 * pump again in the next scan, with no new command. That suits an unattended filling pump; where a restart after a fault
 * needs a person's decision, require AutoEnable to be switched off and on again as well.
 *)

PROGRAM TankLevel

VAR_INPUT
    AutoEnable AT %I0.0 : BOOL;
    LevelLow AT %I0.1 : BOOL;
    LevelHigh AT %I0.2 : BOOL;
    PumpFault AT %I0.3 : BOOL;
    EStop AT %I0.4 : BOOL;
    Reset AT %I0.5 : BOOL;
END_VAR

VAR
    PumpLatched : BOOL := FALSE;    (* a fill is in progress *)
    FaultLatched : BOOL := FALSE;   (* a fault happened and has not been reset *)
    ResetArmed : BOOL := FALSE;     (* Reset has been seen released while the fault was latched *)
END_VAR

VAR_OUTPUT
    Pump AT %Q0.0 : BOOL;
    Alarm AT %Q0.1 : BOOL;
END_VAR

IF EStop OR PumpFault THEN          (* a fault wins over everything and disarms Reset *)
    PumpLatched := FALSE;
    FaultLatched := TRUE;
    ResetArmed := FALSE;
ELSIF FaultLatched THEN             (* the fault input is gone but the latch holds the pump off *)
    PumpLatched := FALSE;
    IF NOT Reset THEN
        ResetArmed := TRUE;
    ELSIF ResetArmed THEN           (* a fresh Reset press: clear the latch *)
        FaultLatched := FALSE;
        ResetArmed := FALSE;
    END_IF;
ELSIF NOT AutoEnable OR LevelHigh THEN
    PumpLatched := FALSE;
ELSIF LevelLow THEN
    PumpLatched := TRUE;
END_IF;

(* The output is gated by every stop condition again, so no latch state can keep the pump on while one of them is present. *)
Pump := PumpLatched AND AutoEnable AND NOT LevelHigh AND NOT EStop AND NOT PumpFault AND NOT FaultLatched;
Alarm := FaultLatched OR EStop OR PumpFault;

END_PROGRAM
