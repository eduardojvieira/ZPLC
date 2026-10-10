PROGRAM Skip
VAR
  Go AT %IX0.0 : BOOL;
  Ran AT %QW0 : INT;
  Passed AT %QW1 : INT;
END_VAR
  LD Go
  JMPCN done
  LD Ran
  ADD 1
  ST Ran
done:
  LD Passed
  ADD 1
  ST Passed
END_PROGRAM
