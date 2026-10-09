PROGRAM Big
VAR
  big : UDINT := 2147483647;
  above AT %QX0.0 : BOOL;
END_VAR
  big := big + 2000000000;
  above := big > 5;
END_PROGRAM
