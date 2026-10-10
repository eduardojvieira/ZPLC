PROGRAM Stamp
VAR
  early : DT := DT#1970-01-01-00:00:01;
  late : DT := DT#2024-01-01-00:00:00;
  copy : DT;
  before AT %QX0.0 : BOOL;
  same AT %QX0.1 : BOOL;
END_VAR
  copy := late;
  before := early < copy;
  same := copy = DT#2024-01-01-00:00:00;
END_PROGRAM
