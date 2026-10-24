import Link from '@docusaurus/Link';
import Paths from './Paths';
import styles from './LandingPage.module.css';
import { useLandingPageContent } from './content';

// The close of the page: the two ways in again, side by side, and where the source lives.
export default function Closing() {
  const { close } = useLandingPageContent();

  return (
    <section className={styles.section} aria-labelledby="close-title">
      <div className={styles.wrap}>
        <h2 id="close-title" className={styles.sectionTitle}>
          {close.title}
        </h2>
        <Paths layout="row" headingLevel={3} />

        <div className={styles.source}>
          <h3 className={styles.subTitle}>{close.sourceTitle}</h3>
          <p>{close.source}</p>
          <p className={styles.links}>
            {close.sourceLinks.map((link) => (
              <Link key={link.label} {...(link.href ? { href: link.href } : { to: link.to })}>
                {link.label}
              </Link>
            ))}
          </p>
        </div>
      </div>
    </section>
  );
}
