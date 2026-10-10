PROGRAM Calendar
VAR
  first : DATE := D#2024-01-01;
  second : DATE := D#2025-06-30;
  copy : DATE;
  before AT %QX0.0 : BOOL;
  same AT %QX0.1 : BOOL;
  differ AT %QX0.2 : BOOL;
END_VAR
  copy := first;
  before := first < second;
  same := copy = D#2024-01-01;
  differ := copy <> second;
END_PROGRAM
