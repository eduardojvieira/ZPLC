import styles from './LandingPage.module.css';
import Link from '@docusaurus/Link';
import HardwareSupport from './HardwareSupport';
import ArchitectureSection from './ArchitectureSection';
import DetailedFeatures from './DetailedFeatures';
import RoadmapSection from './RoadmapSection';
import { useLandingPageContent } from './content';

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
  const { runtimeSection } = useLandingPageContent();

  return (
    <section className={styles.section} id="runtime">
      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>{runtimeSection.label}</span>
        <h2 className={styles.sectionTitle}>{runtimeSection.title}</h2>
        <p className={styles.sectionSubtitle}>{runtimeSection.subtitle}</p>
      </div>

      <div className={styles.runtimeFeatures}>
        <div className={styles.runtimeGrid} style={{ marginBottom: 0 }}>
          {runtimeSection.cards.map((card) => (
            <FeatureCard key={card.title} icon={card.icon} title={card.title} description={card.description} />
          ))}
        </div>
      </div>
    </section>
  );
}

function IDESection() {
  const { ideSection } = useLandingPageContent();

  return (
    <section className={`${styles.section} ${styles.sectionAlt}`} id="ide">
      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>{ideSection.label}</span>
        <h2 className={styles.sectionTitle}>{ideSection.title}</h2>
        <p className={styles.sectionSubtitle}>{ideSection.subtitle}</p>
      </div>

      <div className={styles.ideShowcase}>
        <div className={styles.ideFeatures}>
          {ideSection.cards.map((card) => (
            <div key={card.title} className={styles.ideFeatureCard}>
              <div className={styles.ideFeatureIcon}>{card.icon}</div>
              <h4>{card.title}</h4>
              <p>{card.description}</p>
            </div>
          ))}
        </div>
        <div className={styles.ideScreenshot} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f0f1a' }}>
          <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
            <pre style={{ textAlign: 'left', background: 'transparent', border: 'none', margin: 0 }}>
              {ideSection.snippet}
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  const { ctaSection } = useLandingPageContent();

  return (
    <section className={styles.ctaSection}>
      <div className={styles.ctaContent}>
        <h2 className={styles.ctaTitle}>{ctaSection.title}</h2>
        <p className={styles.ctaSubtitle}>{ctaSection.subtitle}</p>
        <div className={styles.ctaButtons}>
          <Link className={`button button--primary button--lg ${styles.ctaButton}`} to={ctaSection.primaryTo}>
            {ctaSection.primaryCta}
          </Link>
          <a className={`button button--secondary button--lg ${styles.ctaButton}`} href="https://github.com/eduardojvieira/ZPLC" target="_blank" rel="noopener noreferrer">
            {ctaSection.secondaryCta}
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
