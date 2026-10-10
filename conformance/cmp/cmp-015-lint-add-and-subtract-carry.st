PROGRAM Carry
VAR
  a : LINT := 4294967295;
  up : LINT;
  down : LINT;
  zero : LINT := 0;
  one : LINT := 1;
  below : LINT;
  carried AT %QX0.0 : BOOL;
  borrowed AT %QX0.1 : BOOL;
  negative AT %QX0.2 : BOOL;
  back AT %QX0.3 : BOOL;
END_VAR
  up := a + 1;
  down := up - 1;
  below := zero - one;
  carried := up = 4294967296;
  borrowed := down = 4294967295;
  negative := below < 0;
  back := below + one = 0;
END_PROGRAM
