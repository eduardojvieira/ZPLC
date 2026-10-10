FUNCTION Tag : STRING[8]
VAR_INPUT n : INT; END_VAR
  IF n = 1 THEN
    Tag := 'one';
  ELSE
    Tag := 'other';
  END_IF;
END_FUNCTION

PROGRAM Main
VAR
  r : STRING[12];
  l AT %QW0 : INT;
  ok AT %QX2.0 : BOOL;
END_VAR
  r := CONCAT(Tag(1), Tag(2));
  l := LEN(r);
  ok := r = 'oneother';
END_PROGRAM
