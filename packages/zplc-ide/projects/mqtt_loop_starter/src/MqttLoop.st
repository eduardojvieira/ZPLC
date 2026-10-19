PROGRAM MqttLoop
VAR_INPUT Send AT %I0.0 : BOOL; END_VAR
VAR_OUTPUT Joined AT %Q0.0 : BOOL; Subscribed AT %Q0.1 : BOOL; Published AT %Q0.2 : BOOL; Heard AT %Q0.3 : BOOL; Failed AT %Q0.4 : BOOL; END_VAR
VAR Con : MQTT_CONNECT; Sub : MQTT_SUBSCRIBE; Pub : MQTT_PUBLISH; END_VAR
Con(EN := TRUE);
Sub(EN := Con.DONE, QOS := 0, TOPIC := 'plant/cmd');
Joined := Con.DONE;
Subscribed := Sub.DONE;
(* Exercise: publish the payload 'START' to the topic plant/cmd (Pub) when Send is ON and Sub.DONE is TRUE; set Published from Pub.DONE; keep Heard ON from the scan Sub.VALID is TRUE with the payload 'START'; and set Failed when Con.ERROR, Sub.ERROR or Pub.ERROR is TRUE. *)
END_PROGRAM
