(* A comment before the program. *)
PROGRAM Comments
VAR
  q AT %QW0 : INT;
END_VAR
  q := 1; (* a comment after a statement *)
  q := q + (* a comment inside an expression *) 2;
  (* a comment that
     spans two lines *)
  q := q * 5;
END_PROGRAM
