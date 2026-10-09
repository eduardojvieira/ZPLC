PROGRAM Big
VAR
  big : UDINT := 3000000000;
  above AT %QX0.0 : BOOL;
END_VAR
  above := big > 5;
END_PROGRAM
