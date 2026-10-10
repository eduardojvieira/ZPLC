PROGRAM Loop
VAR
  i : INT;
  line : FIFO;
  pile : LIFO;
  line_count AT %QD0 : DINT;
  pile_count AT %QD1 : DINT;
  line_first AT %QD2 : DINT;
END_VAR
  FOR i := 1 TO 40 DO
    line(PUSH := (i MOD 2) = 1, DATA_IN := i, SIZE := 8);
    pile(PUSH := (i MOD 2) = 1, DATA_IN := i, SIZE := 8);
  END_FOR;
  line_count := line.COUNT;
  pile_count := pile.COUNT;
  line(POP := TRUE);
  line_first := line.DATA_OUT;
END_PROGRAM
