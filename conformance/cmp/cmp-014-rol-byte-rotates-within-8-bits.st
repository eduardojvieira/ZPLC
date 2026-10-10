PROGRAM Rotate
VAR
  b : BYTE := 129;
  r AT %QB0 : BYTE;
  w : WORD := 32768;
  rw AT %QW2 : WORD;
END_VAR
  r := ROL(b, 1);
  rw := ROL(w, 1);
END_PROGRAM
