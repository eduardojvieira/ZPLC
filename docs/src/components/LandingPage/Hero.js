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
                <div className={styles.badge}>
                    <span className={styles.badgeIcon}>&#9889;</span>
                    <Translate id="homepage.hero.badge">Open Source Industrial Runtime</Translate>
                </div>
                <h1 className={styles.heroTitle}>
                    <Translate id="homepage.hero.title.oneCore">One Execution Core.</Translate><br />
                    <span className={styles.heroTitleAccent}>
                        <Translate id="homepage.hero.title.anyRuntime">Any Runtime.</Translate>
                    </span>
                </h1>
                <p className={styles.heroSubtitle}>
                    <Translate id="homepage.hero.subtitle">
                        The deterministic, portable, and secure IEC 61131-3 compatible runtime
                        designed for modern industrial automation. Runs on Zephyr, Linux, and Windows.
                    </Translate>
                </p>
                <div className={styles.heroStats}>
                    <div className={styles.stat}>
                        <span className={styles.statValue}>500+</span>
                        <span className={styles.statLabel}><Translate id="homepage.hero.stats.boards">Supported Boards</Translate></span>
                    </div>
                    <div className={styles.statDivider}></div>
                    <div className={styles.stat}>
                        <span className={styles.statValue}>44KB</span>
                        <span className={styles.statLabel}><Translate id="homepage.hero.stats.footprint">Flash Footprint</Translate></span>
                    </div>
                    <div className={styles.statDivider}></div>
                    <div className={styles.stat}>
                        <span className={styles.statValue}>&lt;1ms</span>
                        <span className={styles.statLabel}><Translate id="homepage.hero.stats.jitter">Cycle Jitter</Translate></span>
                    </div>
                </div>
                <div className={styles.buttons}>
                    <Link
                        className={`button button--primary button--lg ${styles.heroButton} ${styles.primaryButton}`}
                        to="/docs/runtime/intro">
                        <Translate id="homepage.hero.button.getStarted">Get Started</Translate>
                        <span className={styles.buttonArrow}>→</span>
                    </Link>
                    <Link
                        className={`button button--secondary button--lg ${styles.heroButton} ${styles.secondaryButton}`}
                        to="/docs/ide/overview">
                        <Translate id="homepage.hero.button.tryOnline">Explore IDE Docs</Translate>
                    </Link>
                </div>
                <div className={styles.trustedBy}>
                    <span className={styles.trustedLabel}><Translate id="homepage.hero.poweredBy">Powered by</Translate></span>
                    <div className={styles.techLogos}>
                        <span className={styles.techLogo}>Zephyr RTOS</span>
                        <span className={styles.techLogo}>WebAssembly</span>
                        <span className={styles.techLogo}>IEC 61131-3</span>
                    </div>
                </div>
            </div>
        </header>
    );
}
