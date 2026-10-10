PROGRAM Feed
VAR
  before AT %QW0 : INT;
  after AT %QW1 : INT;
  scans AT %QW2 : INT;
END_VAR
  before := 7;
  WATCHDOG_RESET();
  after := before + 1;
  scans := scans + 1;
END_PROGRAM
