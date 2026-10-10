PROGRAM Clock
VAR
  late : TOD := TOD#13:00:00;
  early : TOD := TOD#12:30:00;
  after AT %QX0.0 : BOOL;
  back AT %QX0.1 : BOOL;
  shifted AT %QD1 : TOD;
END_VAR
  after := late > early;
  shifted := late - T#30m;
  back := shifted = early;
END_PROGRAM
