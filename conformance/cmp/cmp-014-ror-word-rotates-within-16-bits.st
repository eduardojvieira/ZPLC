PROGRAM Rotate
VAR
  w : WORD := 1;
  r AT %QW0 : WORD;
  b : BYTE := 1;
  rb AT %QB2 : BYTE;
END_VAR
  r := ROR(w, 4);
  rb := ROR(b, 1);
END_PROGRAM
