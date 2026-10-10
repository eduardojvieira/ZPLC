PROGRAM Empty
VAR
  line : FIFO;
  count AT %QD0 : DINT;
  empty AT %QX4.0 : BOOL;
END_VAR
  line(POP := TRUE);
  count := line.COUNT;
  empty := line.EMPTY;
END_PROGRAM
