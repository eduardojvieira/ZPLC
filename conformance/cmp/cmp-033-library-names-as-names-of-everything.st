TYPE Reading : STRUCT Pulse : INT; Blink : INT; END_STRUCT END_TYPE

FUNCTION_BLOCK Scale
VAR_INPUT Counter : INT; END_VAR
VAR_OUTPUT Pwm : INT; END_VAR
  Pwm := Counter * 2;
END_FUNCTION_BLOCK

FUNCTION Twice : INT
VAR_INPUT Ton : INT; END_VAR
  Twice := Ton + Ton;
END_FUNCTION

PROGRAM Names
VAR
  Fifo : Reading;
  Lifo : Scale;
  Rs : INT;
  sum AT %QW0 : INT;
END_VAR
  Fifo.Pulse := 3;
  Fifo.Blink := 4;
  Lifo(Counter := Fifo.Pulse);
  Rs := Twice(Ton := Fifo.Blink);
  sum := Lifo.Pwm + Rs;
END_PROGRAM
