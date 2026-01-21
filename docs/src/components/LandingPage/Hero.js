import React from 'react';
import Link from '@docusaurus/Link';
import styles from './LandingPage.module.css';
import Translate from '@docusaurus/Translate';

export default function Hero() {
    return (
        <header className={styles.heroSection}>
            <div className={styles.heroBackground}>
                <div className={styles.gridPattern}></div>
                <div className={styles.glowOrb1}></div>
                <div className={styles.glowOrb2}></div>
            </div>

            <div className={styles.heroContent}>
                <div className={styles.heroText}>
                    <div className={styles.badge}>
                        <span className={styles.badgeIcon}>⚡</span>
                        <span>Open Source Industrial Runtime</span>
                    </div>

                    <h1 className={styles.heroTitle}>
                        One Core.<br />
                        <span className={styles.heroTitleAccent}>Any Runtime.</span>
                    </h1>

                    <p className={styles.heroSubtitle}>
                        HARD REAL-TIME • MEMORY SAFE • OPEN SOURCE<br />
                        <b>ZPLC</b> bridges the gap between modern software engineering and industrial automation. Runs on Zephyr (ESP32, STM32, Raspberry Pi Pico, Arduino), Linux, Windows, and macOS.
                    </p>

                    <div className={styles.buttons} style={{ justifyContent: 'flex-start' }}>
                        <Link
                            className={`button button--primary button--lg ${styles.heroButton} ${styles.primaryButton}`}
                            to="/docs/runtime/intro">
                            Get Started
                            <span className={styles.buttonArrow}>→</span>
                        </Link>
                        <Link
                            className={`button button--secondary button--lg ${styles.heroButton} ${styles.secondaryButton}`}
                            to="/docs/ide/overview">
                            Open IDE
                        </Link>
                    </div>

                    <div className={styles.trustedBy}>
                        <div className={styles.techLogos} style={{ justifyContent: 'flex-start' }}>
                            <span className={styles.techLogo}>IEC 61131-3</span>
                            <span className={styles.techLogo}>Zephyr RTOS</span>
                            <span className={styles.techLogo}>Modbus TCP</span>
                        </div>
                    </div>
                </div>

                <div className={styles.heroImageContainer}>
                    <img
                        src={require('@site/static/img/hero-ide-runtime.png').default}
                        alt="ZPLC IDE and Controller"
                        className={styles.heroImage}
                    />
                </div>
            </div>
        </header>
    );
}
