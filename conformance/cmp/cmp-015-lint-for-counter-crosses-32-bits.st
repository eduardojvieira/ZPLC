PROGRAM WideFor
VAR
  i : LINT;
  sum : LINT;
  n : LINT;
  down : LINT;
  res_sum AT %QD0 : LINT;
  res_n AT %QD2 : LINT;
  res_down AT %QD4 : LINT;
  res_i AT %QD6 : LINT;
END_VAR
  sum := 0;
  FOR i := 4294967294 TO 4294967298 DO
    sum := sum + i;
    n := n + 1;
  END_FOR;
  down := 0;
  FOR i := 4294967298 TO 4294967294 BY -2 DO
    down := down + 1;
  END_FOR;
  res_sum := sum;
  res_n := n;
  res_down := down;
  res_i := i;
END_PROGRAM
