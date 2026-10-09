PROGRAM Big
VAR
  big : UDINT := 2147483647;
  third AT %QD0 : UDINT;
END_VAR
  big := big + 2000000000;
  third := big / 3;
END_PROGRAM
