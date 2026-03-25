import styles from './LandingPage.module.css';
import { useLandingPageContent } from './content';

export default function HardwareSupport() {
  const { hardwareSection } = useLandingPageContent();

  return (
    <section className={styles.section} id="hardware">
      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>{hardwareSection.label}</span>
        <h2 className={styles.sectionTitle}>{hardwareSection.title}</h2>
        <p className={styles.sectionSubtitle}>{hardwareSection.subtitle}</p>
      </div>
      <div className={styles.heroStats} style={{ justifyContent: 'center', gap: '2.5rem' }}>
        {hardwareSection.boards.map((board) => (
          <div key={board.value} className={styles.stat}>
            <span className={styles.statValue}>{board.value}</span>
            <span className={styles.statLabel}>{board.label}</span>
          </div>
        ))}
      </div>
      <div style={{ textAlign: 'center', marginTop: '2rem' }}>
        <p className={styles.trustedLabel}>{hardwareSection.architectures}</p>
      </div>
    </section>
  );
}
