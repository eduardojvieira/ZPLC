import React from 'react';
import styles from './LandingPage.module.css';

export default function DetailedFeatures() {
    return (
        <section className={`${styles.section} ${styles.sectionAlt}`} id="specs">
            <div className={styles.sectionHeader}>
                <span className={styles.sectionLabel}>TECHNICAL SPECIFICATIONS</span>
                <h2 className={styles.sectionTitle}>Full IEC 61131-3 Compliance</h2>
                <p className={styles.sectionSubtitle}>
                    A complete industrial stack. Not just a toy runtime.
                </p>
            </div>

            <div className={styles.runtimeFeatures}>
                {/* Languages */}
                <div className={styles.runtimeFeature} style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                        <div className={styles.runtimeFeatureIcon}>🗣️</div>
                        <div>
                            <h4>5 Standard Languages</h4>
                            <p style={{ margin: 0 }}>Write logic your way. Mix and match in the same project.</p>
                        </div>
                    </div>
                    <div className={styles.archTargets}>
                        <div className={styles.archTarget}>Structured Text (ST)</div>
                        <div className={styles.archTarget}>Ladder Diagram (LD)</div>
                        <div className={styles.archTarget}>Function Block (FBD)</div>
                        <div className={styles.archTarget}>Sequential Chart (SFC)</div>
                        <div className={styles.archTarget}>Instruction List (IL)</div>
                    </div>
                </div>

                <div className={styles.runtimeGrid} style={{ marginBottom: 0, gap: '2rem' }}>
                    {/* StdLin */}
                    <div className={styles.featureCard}>
                        <h3 className={styles.featureCardTitle}>Standard Library</h3>
                        <ul className={styles.featureCardList}>
                            <li className={styles.featureCardListItem}><span className={styles.checkIcon}>✓</span> 45+ Math & Logic Functions</li>
                            <li className={styles.featureCardListItem}><span className={styles.checkIcon}>✓</span> PID Control (PID_Compact)</li>
                            <li className={styles.featureCardListItem}><span className={styles.checkIcon}>✓</span> Timers (TON, TOF, TP)</li>
                            <li className={styles.featureCardListItem}><span className={styles.checkIcon}>✓</span> Edge Detection (R_TRIG, F_TRIG)</li>
                            <li className={styles.featureCardListItem}><span className={styles.checkIcon}>✓</span> String Manipulation (IEC Standard)</li>
                        </ul>
                    </div>

                    {/* Runtime */}
                    <div className={styles.featureCard}>
                        <h3 className={styles.featureCardTitle}>Runtime Core</h3>
                        <ul className={styles.featureCardList}>
                            <li className={styles.featureCardListItem}><span className={styles.checkIcon}>✓</span> Preemptive Multitasking</li>
                            <li className={styles.featureCardListItem}><span className={styles.checkIcon}>✓</span> Cyclic & Event Tasks</li>
                            <li className={styles.featureCardListItem}><span className={styles.checkIcon}>✓</span> NVS Persistence (Retain)</li>
                            <li className={styles.featureCardListItem}><span className={styles.checkIcon}>✓</span> Watchdog Integration</li>
                            <li className={styles.featureCardListItem}><span className={styles.checkIcon}>✓</span> 64-bit Floating Point Support</li>
                        </ul>
                    </div>
                </div>
            </div>
        </section>
    );
}
