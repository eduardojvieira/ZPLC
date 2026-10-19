TYPE Call : STRUCT Pressed : BOOL; Held : BOOL; END_STRUCT END_TYPE

PROGRAM CallPanel
VAR_INPUT Call1 AT %I0.0 : BOOL; Call2 AT %I0.1 : BOOL; Call3 AT %I0.2 : BOOL; Ack AT %I0.3 : BOOL; END_VAR
VAR_OUTPUT Pending AT %Q0.0 : BOOL; AllCalling AT %Q0.1 : BOOL; END_VAR
VAR Calls : ARRAY[1..3] OF Call; i : INT; END_VAR
Calls[1].Pressed := Call1; Calls[2].Pressed := Call2; Calls[3].Pressed := Call3;
Pending := FALSE;
AllCalling := TRUE;
FOR i := 1 TO 3 DO
  IF Calls[i].Pressed THEN Calls[i].Held := TRUE; END_IF;
  IF Ack THEN Calls[i].Held := FALSE; END_IF;
  IF Calls[i].Held THEN Pending := TRUE; ELSE AllCalling := FALSE; END_IF;
END_FOR;
END_PROGRAM
