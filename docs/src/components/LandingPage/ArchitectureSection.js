import React from 'react';
import styles from './LandingPage.module.css';
import Translate from '@docusaurus/Translate';

export default function ArchitectureSection() {
    return (
        <section className={`${styles.section} ${styles.sectionAlt}`} id="architecture">
            <div className={styles.sectionHeader}>
                <span className={styles.sectionLabel}>SYSTEM ARCHITECTURE</span>
                <h2 className={styles.sectionTitle}>Data Flow</h2>
                <p className={styles.sectionSubtitle}>
                    A transparent pipeline from IEC 61131-3 source to hard real-time execution.
                </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', margin: '2rem 0' }}>
                <img
                    src={require('@site/static/img/architecture-diagram.png').default}
                    alt="ZPLC Architecture Diagram"
                    className={styles.ideScreenshot}
                    style={{ maxWidth: '100%', maxHeight: '600px', objectFit: 'contain' }}
                />
            </div>

            <div className={styles.archFlow}>
                <div className={styles.archFlowStep}>
                    <div className={styles.archFlowIcon}>1</div>
                    <h4>Compiler</h4>
                    <p>Transpiles ST/LD/FBD to optimized bytecode with static analysis.</p>
                </div>
                <div className={styles.archFlowArrow}>→</div>
                <div className={styles.archFlowStep}>
                    <div className={styles.archFlowIcon}>2</div>
                    <h4>Loader</h4>
                    <p>Validates bytecode integrity and links standard libraries.</p>
                </div>
                <div className={styles.archFlowArrow}>→</div>
                <div className={styles.archFlowStep}>
                    <div className={styles.archFlowIcon}>3</div>
                    <h4>VM Runtime</h4>
                    <p>Executes logic in a deterministic, memory-safe loop.</p>
                </div>
            </div>
        </section>
    );
}
