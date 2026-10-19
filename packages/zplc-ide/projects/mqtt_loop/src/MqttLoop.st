PROGRAM MqttLoop
VAR_INPUT Send AT %I0.0 : BOOL; END_VAR
VAR_OUTPUT Joined AT %Q0.0 : BOOL; Subscribed AT %Q0.1 : BOOL; Published AT %Q0.2 : BOOL; Heard AT %Q0.3 : BOOL; Failed AT %Q0.4 : BOOL; END_VAR
VAR Con : MQTT_CONNECT; Sub : MQTT_SUBSCRIBE; Pub : MQTT_PUBLISH; END_VAR
Con(EN := TRUE);
Sub(EN := Con.DONE, QOS := 0, TOPIC := 'plant/cmd');
Joined := Con.DONE;
Subscribed := Sub.DONE;
Pub(EN := Send AND Sub.DONE, QOS := 0, RETAIN := FALSE, TOPIC := 'plant/cmd', PAYLOAD := 'START');
Published := Pub.DONE;
IF Sub.VALID AND (Sub.PAYLOAD = 'START') THEN Heard := TRUE; END_IF;
Failed := Con.ERROR OR Sub.ERROR OR Pub.ERROR;
END_PROGRAM
