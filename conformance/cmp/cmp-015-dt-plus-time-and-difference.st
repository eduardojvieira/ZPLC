PROGRAM Stamp
VAR
  first : DT := DT#2024-01-01-00:00:00;
  second : DT;
  later AT %QX0.0 : BOOL;
  span AT %QD1 : TIME;
END_VAR
  second := first + T#1h;
  later := second > first;
  span := second - first;
END_PROGRAM
