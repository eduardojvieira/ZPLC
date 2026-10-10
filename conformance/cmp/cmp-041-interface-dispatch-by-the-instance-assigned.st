INTERFACE IShape
METHOD Area : INT
END_METHOD
END_INTERFACE

FUNCTION_BLOCK Square IMPLEMENTS IShape
VAR_INPUT side : INT; END_VAR
METHOD Area : INT
  Area := side * side;
END_METHOD
END_FUNCTION_BLOCK

FUNCTION_BLOCK Rectangle IMPLEMENTS IShape
VAR_INPUT width : INT; height : INT; END_VAR
METHOD Area : INT
  Area := width * height;
END_METHOD
END_FUNCTION_BLOCK

PROGRAM Shapes
VAR
  sq : Square;
  rect : Rectangle;
  shape : IShape;
  first AT %QW0 : INT;
  second AT %QW1 : INT;
  third AT %QW2 : INT;
END_VAR
  sq.side := 4;
  rect.width := 3;
  rect.height := 5;
  shape := sq;
  first := shape.Area();
  shape := rect;
  second := shape.Area();
  sq.side := 7;
  shape := sq;
  third := shape.Area();
END_PROGRAM
