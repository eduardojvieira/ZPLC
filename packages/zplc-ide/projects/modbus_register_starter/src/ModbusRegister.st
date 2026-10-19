PROGRAM ModbusRegister
VAR_INPUT Send AT %I0.0 : BOOL; END_VAR
VAR_OUTPUT Written AT %Q0.0 : BOOL; Match AT %Q0.1 : BOOL; Failed AT %Q0.2 : BOOL; END_VAR
VAR Wr : MB_WRITE_HREG; Rd : MB_READ_HREG; END_VAR
Wr(EN := Send, PROTO := 1, SLAVE_ID := 1, ADDR := 8, COUNT := 1, VALUE := 1234, HOST := '127.0.0.1', PORT := 502);
Written := Wr.DONE;
(* Exercise: read register 8 back once the write is done (Rd, EN := Wr.DONE), set Match when Rd.DONE is TRUE and Rd.VALUE equals 1234, and set Failed when Wr.ERROR or Rd.ERROR is TRUE. *)
END_PROGRAM
