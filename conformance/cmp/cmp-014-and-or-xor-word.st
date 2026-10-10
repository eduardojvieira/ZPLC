PROGRAM Bits
VAR
  a : WORD := 61680;
  b : WORD := 4080;
  both AT %QW0 : WORD;
  either AT %QW2 : WORD;
  differ AT %QW4 : WORD;
END_VAR
  both := a AND b;
  either := a OR b;
  differ := a XOR b;
END_PROGRAM
