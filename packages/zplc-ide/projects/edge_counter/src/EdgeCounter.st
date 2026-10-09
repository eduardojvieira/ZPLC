(*
 * Edge Counter - count three pulses, then hold CountReached until Reset.
 *
 * CTU counts rising edges of CU on its own: it keeps CU from the previous scan and adds one only on a FALSE-to-TRUE
 * change. A pulse therefore counts once however many scans it stays high, and PulseInput can be wired straight to CU.
 * An R_TRIG in front of CTU would only turn the same edge into a one-scan pulse that CTU then edge-detects a second time.
 *
 * Reset sets the count to 0 and CountReached to FALSE. Keep Reset and the pulse apart: ZPLC's CTU does not look at CU while
 * Reset is TRUE, so a pulse that rises during Reset is counted on the scan after Reset is released. The IEC definition
 * keeps its edge detector running while R is TRUE and would not count it.
 *)

PROGRAM EdgeCounter

VAR_INPUT
    PulseInput AT %I0.0 : BOOL;
    Reset AT %I0.1 : BOOL;
END_VAR

VAR
    Count : CTU;                    (* up counter: Count.CV is the count so far *)
END_VAR

VAR_OUTPUT
    CountReached AT %Q0.0 : BOOL;   (* TRUE once Count.CV has reached the preset *)
END_VAR

Count(CU := PulseInput, R := Reset, PV := 3);
CountReached := Count.Q;

END_PROGRAM
