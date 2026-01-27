PROGRAM Comparison
VAR
  val AT %Q0.0 : INT;
  is_gt AT %Q2.0 : BOOL;
  is_lt AT %Q3.0 : BOOL;
  is_eq AT %Q4.0 : BOOL;
  is_ne AT %Q5.0 : BOOL;
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

