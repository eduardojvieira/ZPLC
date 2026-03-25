import styles from './LandingPage.module.css';
import { useLandingPageContent } from './content';

export default function DetailedFeatures() {
  const { documentationSection } = useLandingPageContent();

  return (
    <section className={`${styles.section} ${styles.sectionAlt}`} id="specs">
      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>{documentationSection.label}</span>
        <h2 className={styles.sectionTitle}>{documentationSection.title}</h2>
        <p className={styles.sectionSubtitle}>{documentationSection.subtitle}</p>
      </div>

      <div className={styles.runtimeFeatures}>
        <div className={styles.runtimeFeature} style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            <div className={styles.runtimeFeatureIcon}>🗂️</div>
            <div>
              <h4>{documentationSection.languageBlock.title}</h4>
              <p style={{ margin: 0 }}>{documentationSection.languageBlock.description}</p>
            </div>
          </div>
          <div className={styles.archTargets}>
            {documentationSection.languageBlock.items.map((item) => (
              <div key={item} className={styles.archTarget}>
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className={styles.runtimeGrid} style={{ marginBottom: 0, gap: '2rem' }}>
          <div className={styles.featureCard}>
            <h3 className={styles.featureCardTitle}>{documentationSection.referenceBlock.title}</h3>
            <ul className={styles.featureCardList}>
              {documentationSection.referenceBlock.items.map((item) => (
                <li key={item} className={styles.featureCardListItem}>
                  <span className={styles.checkIcon}>✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.featureCard}>
            <h3 className={styles.featureCardTitle}>{documentationSection.languageBlock.title}</h3>
            <ul className={styles.featureCardList}>
              {documentationSection.languageBlock.items.map((item) => (
                <li key={item} className={styles.featureCardListItem}>
                  <span className={styles.checkIcon}>✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
