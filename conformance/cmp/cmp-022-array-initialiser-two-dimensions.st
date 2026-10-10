PROGRAM Main
VAR
  a : ARRAY[0..1, 0..2] OF INT := [[1, 2, 3], [4, 5, 6]];
  b : ARRAY[0..1, 0..1] OF INT := [10, 20, 30, 40];
  mid AT %QW0 : INT;
  last AT %QW1 : INT;
  flat AT %QW2 : INT;
END_VAR
  mid := a[1, 1];
  last := a[1, 2];
  flat := b[1, 0];
END_PROGRAM
