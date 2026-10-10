PROGRAM Extremes
VAR
  top : LINT := 9223372036854775807;
  bottom : LINT := -9223372036854775808;
  ordered AT %QX0.0 : BOOL;
  sum AT %QX0.1 : BOOL;
  wraps AT %QX0.2 : BOOL;
  negated AT %QX0.3 : BOOL;
END_VAR
  ordered := top > bottom;
  sum := top + bottom = -1;
  wraps := top + 1 = bottom;
  negated := -top = bottom + 1;
END_PROGRAM
