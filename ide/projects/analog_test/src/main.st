PROGRAM main
VAR
    (* Channel 4 (Temp) -> Offset 16 (8 + 4*2) = Word 8 = %IW8 *)
    TempRaw AT %IW8 : INT;
    TempC : DINT;
END_VAR

(* Calculate Temperature *)
(* 12-bit ADC (4095) -> 3.3V *)
(* Formula: Temp = 27 - (V - 0.706)/0.001721 *)
(* Scaled: Temp = 27 - (mV - 706) * 1000 / 1721 *)
(* mV = Raw * 3300 / 4096 *)

IF TempRaw > 0 THEN
    TempC := 27 - (((TempRaw * 3300 / 4096) - 706) * 1000) / 1721;
ELSE
    TempC := 999; (* Error value *)
END_IF;

END_PROGRAM
