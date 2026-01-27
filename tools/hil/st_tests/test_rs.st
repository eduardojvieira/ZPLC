PROGRAM TestRS
VAR
    latch : RS;
    s_in : BOOL;
    r_in : BOOL;
    q_out : BOOL;
END_VAR

latch(S := s_in, R1 := r_in);
q_out := latch.Q1;

END_PROGRAM
