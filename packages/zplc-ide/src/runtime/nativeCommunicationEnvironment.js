/**
 * COM-009: a simulation talks to the Modbus server and the MQTT broker that its own runtime starts on 127.0.0.1, and to
 * nothing else: a broker named in the environment of the application is not a peer of a simulation. Studio (the
 * Electron host) and the command line (`zplc test`, the scenario runner) both build their native-runtime environment
 * through this one function, so a program is graded the same way in both.
 */
export function withNativeCommunicationEnvironment(environment) {
    const childEnvironment = { ...environment };
    childEnvironment.ZPLC_NATIVE_COMM = '1';
    childEnvironment.ZPLC_NATIVE_LOOPBACK = '1';
    delete childEnvironment.ZPLC_NATIVE_MQTT_BROKER;
    return childEnvironment;
}
//# sourceMappingURL=nativeCommunicationEnvironment.js.map