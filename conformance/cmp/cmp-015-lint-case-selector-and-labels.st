PROGRAM WideCase
VAR
  sel : LINT;
  r1 AT %QD0 : DINT;
  r2 AT %QD1 : DINT;
  r3 AT %QD2 : DINT;
  r4 AT %QD3 : DINT;
END_VAR
  sel := 5000000000;
  CASE sel OF
    1: r1 := 1;
    5000000000: r1 := 2;
    -5000000000: r1 := 3;
  ELSE r1 := 9;
  END_CASE;
  sel := -5000000000;
  CASE sel OF
    1: r2 := 1;
    5000000000: r2 := 2;
    -5000000000: r2 := 3;
  ELSE r2 := 9;
  END_CASE;
  sel := 9000000000000000000;
  CASE sel OF
    1..10: r3 := 1;
    8000000000000000000..9223372036854775807: r3 := 2;
  ELSE r3 := 9;
  END_CASE;
  sel := 77;
  CASE sel OF
    1..10: r4 := 1;
    4294967296: r4 := 2;
  END_CASE;
  r4 := r4 + 40;
END_PROGRAM
