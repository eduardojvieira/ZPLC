import React from 'react';
import styles from './LandingPage.module.css';
import Translate from '@docusaurus/Translate';
import Link from '@docusaurus/Link';
import HardwareSupport from './HardwareSupport';
import ArchitectureSection from './ArchitectureSection';
import DetailedFeatures from './DetailedFeatures';
import RoadmapSection from './RoadmapSection';

function FeatureCard({ icon, title, description }) {
    return (
        <div className={styles.featureCard}>
            <div className={styles.featureCardIcon}>{icon}</div>
            <h3 className={styles.featureCardTitle}>{title}</h3>
            <p className={styles.featureCardDescription}>{description}</p>
        </div>
    );
}

function RuntimeSection() {
    return (
        <section className={styles.section} id="runtime">
            <div className={styles.sectionHeader}>
                <span className={styles.sectionLabel}>CORE PHILOSOPHY</span>
                <h2 className={styles.sectionTitle}>The "Cabinet Test" Compliant</h2>
                <p className={styles.sectionSubtitle}>
                    If it can't run for 10 years in a dusty cabinet at 50°C without a memory leak, it's not ZPLC.
                </p>
            </div>

            <div className={styles.runtimeFeatures}>
                <div className={styles.runtimeGrid} style={{ marginBottom: 0 }}>
                    <FeatureCard
                        icon="🛡️"
                        title="Zero Dynamic Memory"
                        description="No 'malloc' in the hot cycle. All memory is statically allocated or slab-managed at startup. No fragmentation, ever."
                    />
                    <FeatureCard
                        icon="⚡"
                        title="Hard Real-Time"
                        description="Cycle jitter < 10µs on Zephyr RTOS. Predictable execution time regardless of logic complexity."
                    />
                    <FeatureCard
                        icon="🔒"
                        title="Safety First"
                        description="Strict bounds checking on all array/pointer access. The VM crashes safely before the machine does."
                    />
                    <FeatureCard
                        icon="📦"
                        title="44KB Footprint"
                        description="Runs on $2 chips. Why pay for an IPC when an MCU can do the job?"
                    />
                </div>
            </div>
        </section>
    );
}

function IDESection() {
    return (
        <section className={`${styles.section} ${styles.sectionAlt}`} id="ide">
            <div className={styles.sectionHeader}>
                <span className={styles.sectionLabel}>DEVELOPMENT</span>
                <h2 className={styles.sectionTitle}>VSCode-Class Experience</h2>
                <p className={styles.sectionSubtitle}>
                    Stop using 10GB IDEs from the 90s.
                </p>
            </div>

            <div className={styles.ideShowcase}>
                <div className={styles.ideFeatures}>
                    <div className={styles.ideFeatureCard}>
                        <div className={styles.ideFeatureIcon}>🌐</div>
                        <h4>Zero Install</h4>
                        <p>Runs entirely in the browser (or Electron). Connects via WebSerial.</p>
                    </div>
                    <div className={styles.ideFeatureCard}>
                        <div className={styles.ideFeatureIcon}>⌨️</div>
                        <h4>Vim Mode</h4>
                        <p>Yes, we added Vim keybindings. You're welcome.</p>
                    </div>
                    <div className={styles.ideFeatureCard}>
                        <div className={styles.ideFeatureIcon}>🐙</div>
                        <h4>Git Native</h4>
                        <p>Files are text. Commits are readable. No binary blob magic.</p>
                    </div>
                    <div className={styles.ideFeatureCard}>
                        <div className={styles.ideFeatureIcon}>🔎</div>
                        <h4>Lsp Support</h4>
                        <p>Real-time syntax checking, Go-to-Definition, and Refactoring tools.</p>
                    </div>
                </div>
                <div className={styles.ideScreenshot} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f0f1a' }}>
                    {/* Placeholder for small interaction or code snippet if needed, keeping it simple for now */}
                    <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
                        <pre style={{ textAlign: 'left', background: 'transparent', border: 'none', margin: 0 }}>
                            {`PROGRAM Main
VAR
  Counter : INT := 0;
END_VAR

Counter := Counter + 1;
IF Counter > 100 THEN
  Counter := 0;
END_IF;
END_PROGRAM`}
                        </pre>
                    </div>
                </div>
            </div>
        </section>
    );
}

function CTASection() {
    return (
        <section className={styles.ctaSection}>
            <div className={styles.ctaContent}>
                <h2 className={styles.ctaTitle}>
                    Ready to Ship?
                </h2>
                <p className={styles.ctaSubtitle}>
                    Open Source. No License Keys. No Dongles.
                </p>
                <div className={styles.ctaButtons}>
                    <Link className={`button button--primary button--lg ${styles.ctaButton}`} to="/docs/runtime/intro">
                        Read the Docs
                    </Link>
                    <a className={`button button--secondary button--lg ${styles.ctaButton}`} href="https://github.com/eduardojvieira/ZPLC" target="_blank" rel="noopener noreferrer">
                        GitHub Repo
                    </a>
                </div>
            </div>
        </section>
    );
}

export default function Features() {
    return (
        <>
            <RuntimeSection />
            <ArchitectureSection />
            <HardwareSupport />
            <DetailedFeatures />
            <RoadmapSection />
            <IDESection />
            <CTASection />
        </>
    );
}
