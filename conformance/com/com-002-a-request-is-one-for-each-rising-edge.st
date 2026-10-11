PROGRAM OneForEachEdge
VAR
  Trigger AT %IX0.0 : BOOL;
  Link : MQTT_PUBLISH;
  Edges AT %QW0 : INT;
  Previous : BOOL;
  Failed AT %QX2.0 : BOOL;
  Code AT %QD1 : DINT;
END_VAR
  Link(EN := Trigger, QOS := 0, RETAIN := FALSE, TOPIC := 'plant/a', PAYLOAD := 'x');
  Failed := Link.ERROR;
  Code := Link.STATUS;
  IF Link.ERROR AND NOT Previous THEN
    Edges := Edges + 1;
  END_IF;
  Previous := Link.ERROR;
END_PROGRAM
