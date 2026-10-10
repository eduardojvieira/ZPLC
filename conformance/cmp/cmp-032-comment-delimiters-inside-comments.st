PROGRAM Comments
VAR
  seen AT %QW0 : INT;
END_VAR
  (* a /* inside *) seen := 1;
  /* a (* inside */ seen := seen + 1;
  // (* not an opener
  seen := seen + 1; /* trailing */ (* and another *)
END_PROGRAM
