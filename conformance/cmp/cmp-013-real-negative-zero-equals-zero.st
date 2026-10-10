PROGRAM Zeros
VAR
  zero : REAL := 0.0;
  neg : REAL;
  same AT %QX0.0 : BOOL;
  below AT %QX0.1 : BOOL;
  differ AT %QX0.2 : BOOL;
END_VAR
  neg := -zero;
  same := neg = zero;
  below := neg < zero;
  differ := neg <> zero;
END_PROGRAM
