TYPE Sample :
STRUCT
  weight : LREAL;
  count : LINT;
  flag : BOOL;
END_STRUCT
END_TYPE

FUNCTION Lerp : LREAL
VAR_INPUT
  a : LREAL;
  b : LREAL;
  t : LREAL;
END_VAR
  Lerp := a + (b - a) * t;
END_FUNCTION

FUNCTION Scale : LINT
VAR_INPUT
  base : LINT;
  factor : ULINT;
END_VAR
  Scale := base * factor;
END_FUNCTION

PROGRAM WidePlaces
VAR
  values : ARRAY[0..3] OF LREAL := [0.5, 0.25, 0.125, 0.0625];
  counts : ARRAY[1..3] OF LINT := [10000000000, -20000000000, 30000000000];
  s : Sample;
  sum : LREAL;
  total : LINT;
  i : DINT;
  o_sum AT %QD0 : LREAL;
  o_total AT %QD2 : LINT;
  o_weight AT %QD4 : LREAL;
  o_count AT %QD6 : LINT;
  o_flag AT %QX512.0 : BOOL;
  o_lerp AT %QD8 : LREAL;
  o_lerp2 AT %QD10 : LREAL;
  o_scale AT %QD12 : LINT;
END_VAR
  sum := 0.0;
  total := 0;
  FOR i := 0 TO 3 DO
    sum := sum + values[i];
  END_FOR;
  FOR i := 1 TO 3 DO
    total := total + counts[i];
  END_FOR;
  s.weight := 0.1;
  s.count := 5000000000;
  s.flag := TRUE;
  s.weight := s.weight + 0.2;
  s.count := s.count * 3;
  o_sum := sum;
  o_total := total;
  o_weight := s.weight;
  o_count := s.count;
  o_flag := s.flag;
  o_lerp := Lerp(1.0, 2.0, 0.1);
  o_lerp2 := Lerp(values[0], values[3], 0.5);
  o_scale := Scale(-3000000000, 4);
END_PROGRAM
