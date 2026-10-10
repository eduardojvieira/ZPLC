PROGRAM Main
VAR
  e : STRING[8] := 'AB';
  f : STRING[8] := 'AB';
  g : STRING[8] := 'ABCD';
  h : STRING[8] := 'ABCDE';
  okE AT %QX0.0 : BOOL;
  okF AT %QX0.1 : BOOL;
  okG AT %QX0.2 : BOOL;
  okH AT %QX0.3 : BOOL;
END_VAR
  e := CONCAT(e, e);
  f := CONCAT('xy', f);
  g := INSERT(g, '--', 2);
  h := REPLACE(h, 'Y', 2, 3);
  okE := e = 'ABAB';
  okF := f = 'xyAB';
  okG := g = 'AB--CD';
  okH := h = 'AYE';
END_PROGRAM
