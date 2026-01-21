import React from 'react';
import styles from './LandingPage.module.css';

export default function RoadmapSection() {
    return (
        <section className={styles.section} id="roadmap">
            <div className={styles.sectionHeader}>
                <span className={styles.sectionLabel}>DEVELOPMENT ROADMAP</span>
                <h2 className={styles.sectionTitle}>What's Next?</h2>
                <p className={styles.sectionSubtitle}>
                    ZPLC is evolving rapidly. Here is our path to v2.0.
                </p>
            </div>

            <div className={styles.archFlow} style={{ alignItems: 'stretch' }}>
                {/* Phase 1.4 */}
                <div className={styles.archFlowStep} style={{ border: '1px solid #22d3ee', background: 'rgba(34, 211, 238, 0.05)' }}>
                    <div className={styles.sectionLabel} style={{ marginBottom: '1rem' }}>
                        NOW (v1.4)
                    </div>
                    <h4>Stable Runtime</h4>
                    <ul style={{ listStyle: 'none', padding: 0, textAlign: 'left', marginTop: '1rem' }}>
                        <li className={styles.featureCardListItem}>✓ Cross-Platform Desktop IDE</li>
                        <li className={styles.featureCardListItem}>✓ Native Serial Support</li>
                        <li className={styles.featureCardListItem}>✓ NVS Persistence</li>
                        <li className={styles.featureCardListItem}>✓ Full WASM Simulation</li>
                    </ul>
                </div>

                <div className={styles.archFlowArrow}>→</div>

                {/* Phase 1.5 */}
                <div className={styles.archFlowStep}>
                    <div className={styles.sectionLabel} style={{ marginBottom: '1rem', color: '#a855f7', borderColor: 'rgba(168, 85, 247, 0.2)', background: 'rgba(168, 85, 247, 0.05)' }}>
                        NEXT (v1.5)
                    </div>
                    <h4>Connectivity</h4>
                    <ul style={{ listStyle: 'none', padding: 0, textAlign: 'left', marginTop: '1rem' }}>
                        <li className={styles.featureCardListItem}>⏳ Modbus TCP/RTU</li>
                        <li className={styles.featureCardListItem}>⏳ MQTT v5.0 Client</li>
                        <li className={styles.featureCardListItem}>⏳ Sparkplug B Support</li>
                        <li className={styles.featureCardListItem}>⏳ AWS IoT Core Integration</li>
                    </ul>
                </div>

                <div className={styles.archFlowArrow}>→</div>

                {/* Phase 2.0 */}
                <div className={styles.archFlowStep}>
                    <div className={styles.sectionLabel} style={{ marginBottom: '1rem', color: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.2)', background: 'rgba(245, 158, 11, 0.05)' }}>
                        FUTURE (v2.0)
                    </div>
                    <h4>Integrated HMI</h4>
                    <ul style={{ listStyle: 'none', padding: 0, textAlign: 'left', marginTop: '1rem' }}>
                        <li className={styles.featureCardListItem}>🚀 Drag-and-Drop Designer</li>
                        <li className={styles.featureCardListItem}>🚀 LVGL Native Integration</li>
                        <li className={styles.featureCardListItem}>🚀 Touchscreen Support</li>
                        <li className={styles.featureCardListItem}>🚀 OTA Updates</li>
                    </ul>
                </div>
            </div>
        </section>
    );
}
