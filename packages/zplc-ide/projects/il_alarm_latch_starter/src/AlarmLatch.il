PROGRAM AlarmLatch
VAR_INPUT
    Fault AT %I0.0 : BOOL;
    Ack AT %I0.1 : BOOL;
END_VAR
VAR_OUTPUT
    SetFirst AT %Q0.0 : BOOL;
    ResetFirst AT %Q0.1 : BOOL;
END_VAR

(* Exercise: both outputs latch a fault until Ack. SetFirst wins when Fault and Ack arrive together; ResetFirst loses to Ack. *)
        LD    Fault
        ST    SetFirst
        ST    ResetFirst
END_PROGRAM
