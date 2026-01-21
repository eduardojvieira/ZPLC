import React from 'react';
import styles from './LandingPage.module.css';
import Translate from '@docusaurus/Translate';

export default function HardwareSupport() {
    return (
        <section className={styles.section} id="hardware">
            <div className={styles.sectionHeader}>
                <span className={styles.sectionLabel}>HARDWARE INDEPENDENCE</span>
                <h2 className={styles.sectionTitle}>Runs Everywhere</h2>
                <p className={styles.sectionSubtitle}>
                    From $4 microcontrollers to industrial PCs. ZPLC abstracts the hardware so your code remains portable.
                </p>
            </div>
            <div className={styles.heroStats} style={{ justifyContent: 'center', gap: '4rem' }}>
                <div className={styles.stat}>
                    <span className={styles.statValue}>RP2040</span>
                    <span className={styles.statLabel}>Raspberry Pi Pico</span>
                </div>
                <div className={styles.stat}>
                    <span className={styles.statValue}>ESP32</span>
                    <span className={styles.statLabel}>Espressif S3/wroom</span>
                </div>
                <div className={styles.stat}>
                    <span className={styles.statValue}>STM32</span>
                    <span className={styles.statLabel}>H7 / F4 / G4</span>
                </div>
                <div className={styles.stat}>
                    <span className={styles.statValue}>x86_64</span>
                    <span className={styles.statLabel}>Linux / Windows</span>
                </div>
            </div>
            <div style={{ textAlign: 'center', marginTop: '2rem' }}>
                <p className={styles.trustedLabel}>SUPPORTED ARCHITECTURES: ARM Thumb-2 • Xtensa • x86 • RISC-V • WASM</p>
            </div>
        </section>
    );
}
