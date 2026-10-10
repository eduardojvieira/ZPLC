INTERFACE IMeasure
METHOD Read : INT
END_METHOD
END_INTERFACE

FUNCTION_BLOCK Fixed IMPLEMENTS IMeasure
METHOD Read : INT
  Read := 40;
END_METHOD
END_FUNCTION_BLOCK

FUNCTION_BLOCK Counted IMPLEMENTS IMeasure
VAR reads : INT; END_VAR
METHOD Read : INT
  reads := reads + 1;
  Read := reads;
END_METHOD
END_FUNCTION_BLOCK

FUNCTION Twice : INT
VAR_INPUT source : IMeasure; END_VAR
  Twice := source.Read() + source.Read();
END_FUNCTION

PROGRAM Sampling
VAR
  f : Fixed;
  c : Counted;
  a AT %QW0 : INT;
  b AT %QW1 : INT;
END_VAR
  a := Twice(source := f);
  b := Twice(source := c);
END_PROGRAM
