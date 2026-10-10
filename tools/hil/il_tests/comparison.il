PROGRAM Comparison
VAR
  val AT %QW0 : INT;
  is_gt AT %QX2.0 : BOOL;
  is_lt AT %QX3.0 : BOOL;
  is_eq AT %QX4.0 : BOOL;
  is_ne AT %QX5.0 : BOOL;
END_VAR

(* Explicit init *)
LD 50
ST val

LD val
GT 40
ST is_gt

LD val
LT 60
ST is_lt

LD val
EQ 50
ST is_eq

LD val
NE 99
ST is_ne
END_PROGRAM

