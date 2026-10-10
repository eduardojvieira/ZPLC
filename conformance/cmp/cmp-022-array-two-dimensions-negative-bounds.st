PROGRAM Main
VAR
  a : ARRAY[-1..1, 0..2] OF INT;
  r : INT;
  c : INT;
  low AT %QW0 : INT;
  high AT %QW1 : INT;
  mid AT %QW2 : INT;
END_VAR
  FOR r := -1 TO 1 DO
    FOR c := 0 TO 2 DO
      a[r, c] := r * 10 + c;
    END_FOR;
  END_FOR;
  low := a[-1, 2];
  high := a[1, 0];
  mid := a[0, 1];
END_PROGRAM
