PROGRAM NumericTank
VAR_INPUT
    Pot   AT %IW0 : INT;   (* Pot1.value: raw 0..1000 for 0..100 % *)
    Level AT %ID1 : REAL;  (* Tank1.level: raw 0..100 for 0..1 m *)
END_VAR
VAR_OUTPUT
    Fill  AT %QW0 : INT;   (* Tank1.fill: the inlet valve follows the potentiometer *)
    Shown AT %QD1 : REAL;  (* Display1.value: the level in percent of the tank height *)
END_VAR

Fill  := Pot;
Shown := Level;

END_PROGRAM
