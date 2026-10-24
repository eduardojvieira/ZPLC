PROGRAM EdgeCounter
VAR_INPUT
    PulseInput AT %I0.0 : BOOL;
    Reset AT %I0.1 : BOOL;
END_VAR
VAR_OUTPUT
    CountReached AT %Q0.0 : BOOL;
END_VAR
VAR
    Count : CTU;
END_VAR

(* Exercise: call the CTU with PV 3: CountReached turns ON on the third rising edge of PulseInput and Reset clears the count. *)
        LD    FALSE
        ST    CountReached
END_PROGRAM
