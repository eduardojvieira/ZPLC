PROGRAM Clock
VAR
  start : TOD := TOD#12:30:00;
  later AT %QD0 : TOD;
END_VAR
  later := start + T#1h;
END_PROGRAM
