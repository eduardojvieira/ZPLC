PROGRAM Main
VAR
  a : STRING[8] := 'ABCDEFGH';
  b : STRING[8] := 'ABCDEFGH';
  c : STRING[8] := 'ABCDEFGH';
  d : STRING[8] := 'ABCDEFGH';
  okA AT %QX0.0 : BOOL;
  okB AT %QX0.1 : BOOL;
  okC AT %QX0.2 : BOOL;
  okD AT %QX0.3 : BOOL;
  lenA AT %QW1 : INT;
END_VAR
  a := LEFT(a, 3);
  b := RIGHT(b, 3);
  c := MID(c, 3, 2);
  d := DELETE(d, 3, 4);
  okA := a = 'ABC';
  okB := b = 'FGH';
  okC := c = 'CD';
  okD := d = 'ABGH';
  lenA := LEN(a);
END_PROGRAM
