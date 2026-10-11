PROGRAM Handshake
VAR
  Trigger AT %IX0.0 : BOOL;
  Link : MB_WRITE_COIL;
  Failed AT %QX0.0 : BOOL;
  Done AT %QX0.1 : BOOL;
  Busy AT %QX0.2 : BOOL;
  Code AT %QD1 : DINT;
END_VAR
  Link(EN := Trigger, PROTO := 1, SLAVE_ID := 1, ADDR := 0, COUNT := 1, VALUE := TRUE, HOST := '127.0.0.1', PORT := 502);
  Failed := Link.ERROR;
  Done := Link.DONE;
  Busy := Link.BUSY;
  Code := Link.STATUS;
END_PROGRAM
