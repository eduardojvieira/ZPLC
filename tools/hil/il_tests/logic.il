PROGRAM Logic
VAR
  t AT %QX0.0 : BOOL := TRUE;
  f AT %QX1.0 : BOOL := FALSE;
  res_and AT %QX2.0 : BOOL;
  res_or AT %QX3.0 : BOOL;
  res_xor AT %QX4.0 : BOOL;
  res_not AT %QX5.0 : BOOL;
END_VAR

(* Explicit Init *)
LD TRUE
ST t
LD FALSE
ST f

LD t
AND f
ST res_and

LD t
OR f
ST res_or

LD t
XOR f
ST res_xor

LD t
NOT
ST res_not
END_PROGRAM
