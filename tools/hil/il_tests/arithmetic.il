PROGRAM Arithmetic
VAR
  a AT %Q0.0 : INT;
  b AT %Q2.0 : INT;
  res_add AT %Q4.0 : INT;
  res_sub AT %Q6.0 : INT;
  res_mul AT %Q8.0 : INT;
  res_div AT %Q10.0 : INT;
  res_mod AT %Q12.0 : INT;
END_VAR

(* Explicit init for test stability *)
LD 10
ST a
LD 5
ST b

LD a
ADD b
ST res_add
LD a
SUB b
ST res_sub
LD a
MUL b
ST res_mul
LD a
DIV b
ST res_div
LD a
MOD b
ST res_mod
END_PROGRAM

