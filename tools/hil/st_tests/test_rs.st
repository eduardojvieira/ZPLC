PROGRAM TestRS
VAR
    latch : RS;
    s_in AT %IX0.0 : BOOL;
    r_in AT %IX0.1 : BOOL;
    q_out AT %QX0.0 : BOOL;
END_VAR

latch(S := s_in, R1 := r_in);
q_out := latch.Q1;

END_PROGRAM
