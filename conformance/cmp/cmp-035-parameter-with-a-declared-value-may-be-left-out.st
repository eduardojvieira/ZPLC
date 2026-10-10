FUNCTION Scale : INT
VAR_INPUT value : INT; factor : INT := 10; END_VAR
  Scale := value * factor;
END_FUNCTION

PROGRAM Arguments
VAR
  by_default AT %QW0 : INT;
  given AT %QW1 : INT;
END_VAR
  by_default := Scale(3);
  given := Scale(3, 2);
END_PROGRAM
