PROGRAM Strings
VAR
  Pub : MQTT_PUBLISH;
  Prov : AZURE_DPS_PROV;
  Rd : MB_READ_HREG;
  Name : STRING[20] := 'plant/line-7';
  TopicLen AT %QW0 : INT;
  PayloadLen AT %QW1 : INT;
  TopicOk AT %QX4.0 : BOOL;
  FromVariable AT %QW3 : INT;
  DeviceLen AT %QW4 : INT;
  HostLen AT %QW5 : INT;
  PortValue AT %QW6 : UINT;
END_VAR
  Pub(EN := FALSE, QOS := 1, RETAIN := FALSE, TOPIC := 'plant/a', PAYLOAD := 'hello');
  Prov(EN := FALSE, DEVICE_ID := Name);
  Rd(EN := FALSE, PROTO := 1, SLAVE_ID := 3, ADDR := 5, COUNT := 1, HOST := '10.0.0.5', PORT := 1502);
  TopicLen := LEN(Pub.TOPIC);
  PayloadLen := LEN(Pub.PAYLOAD);
  TopicOk := Pub.TOPIC = 'plant/a';
  FromVariable := LEN(Prov.DEVICE_ID);
  DeviceLen := LEN(Prov.ASSIGNED_HUB);
  HostLen := LEN(Rd.HOST);
  PortValue := Rd.PORT;
END_PROGRAM
