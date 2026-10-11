PROGRAM Arithmetic
VAR
  a AT %QW0 : INT;
  b AT %QW1 : INT;
  res_add AT %QW2 : INT;
  res_sub AT %QW3 : INT;
  res_mul AT %QW4 : INT;
  res_div AT %QW5 : INT;
  res_mod AT %QW6 : INT;
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

