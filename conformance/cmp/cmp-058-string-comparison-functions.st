PROGRAM Compare
VAR
  apple : STRING[20] := 'apple';
  banana : STRING[20] := 'banana';
  upper : STRING[20] := 'Apple';
  empty : STRING[20] := '';
  c0 AT %QB0 : SINT;
  c1 AT %QB1 : SINT;
  c2 AT %QB2 : SINT;
  c3 AT %QB3 : SINT;
  c4 AT %QB4 : SINT;
  e0 AT %QX8.0 : BOOL;
  e1 AT %QX8.1 : BOOL;
  e2 AT %QX8.2 : BOOL;
  n0 AT %QX8.3 : BOOL;
  n1 AT %QX8.4 : BOOL;
  n2 AT %QX8.5 : BOOL;
END_VAR
  c0 := STRCMP(apple, banana);
  c1 := STRCMP(banana, apple);
  c2 := STRCMP(apple, apple);
  c3 := STRCMP(upper, apple);
  c4 := STRCMP(empty, empty);
  e0 := EQ_STRING(apple, 'apple');
  e1 := EQ_STRING(apple, banana);
  e2 := EQ_STRING(empty, empty);
  n0 := NE_STRING(apple, banana);
  n1 := NE_STRING(apple, 'apple');
  n2 := NE_STRING(upper, apple);
END_PROGRAM
