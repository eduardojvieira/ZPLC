import { Fragment } from 'react';
import styles from './LandingPage.module.css';
import { useLandingPageContent } from './content';

export default function RoadmapSection() {
  const { roadmapSection } = useLandingPageContent();

  return (
    <section className={styles.section} id="roadmap">
      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>{roadmapSection.label}</span>
        <h2 className={styles.sectionTitle}>{roadmapSection.title}</h2>
        <p className={styles.sectionSubtitle}>{roadmapSection.subtitle}</p>
      </div>

      <div className={styles.archFlow} style={{ alignItems: 'stretch' }}>
        {roadmapSection.phases.map((phase, index) => (
          <Fragment key={phase.title}>
            <div className={styles.archFlowStep} style={phase.accentStyle}>
              <div className={styles.sectionLabel} style={{ marginBottom: '1rem', ...phase.badgeStyle }}>
                {phase.badge}
              </div>
              <h4>{phase.title}</h4>
              <ul style={{ listStyle: 'none', padding: 0, textAlign: 'left', marginTop: '1rem' }}>
                {phase.items.map((item) => (
                  <li key={item} className={styles.featureCardListItem}>
                    ✓ {item}
                  </li>
                ))}
              </ul>
            </div>
            {index < roadmapSection.phases.length - 1 ? (
              <div className={styles.archFlowArrow}>
                →
              </div>
            ) : null}
          </Fragment>
        ))}
      </div>
    </section>
  );
}
