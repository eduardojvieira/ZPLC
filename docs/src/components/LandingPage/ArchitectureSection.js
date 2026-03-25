import { Fragment } from 'react';
import styles from './LandingPage.module.css';
import { useLandingPageContent } from './content';

export default function ArchitectureSection() {
  const { architectureSection } = useLandingPageContent();

  return (
    <section className={`${styles.section} ${styles.sectionAlt}`} id="architecture">
      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>{architectureSection.label}</span>
        <h2 className={styles.sectionTitle}>{architectureSection.title}</h2>
        <p className={styles.sectionSubtitle}>{architectureSection.subtitle}</p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', margin: '2rem 0' }}>
        <img
          src={require('@site/static/img/architecture-diagram.png').default}
          alt={architectureSection.title}
          className={styles.ideScreenshot}
          style={{ maxWidth: '100%', maxHeight: '600px', objectFit: 'contain' }}
        />
      </div>

      <div className={styles.archFlow}>
        {architectureSection.steps.map((step, index) => (
          <Fragment key={step.title}>
            <div className={styles.archFlowStep}>
              <div className={styles.archFlowIcon}>{step.icon}</div>
              <h4>{step.title}</h4>
              <p>{step.description}</p>
            </div>
            {index < architectureSection.steps.length - 1 ? (
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
