import { useRef, useState } from 'react';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import styles from './LandingPage.module.css';
import { keepStandard, useLandingPageContent, withCode } from './content';
import { nextTab } from './tabs';

function Panel({ item, selected }) {
  const shot = useBaseUrl(`/img/${item.shot}`);
  return (
    <div
      role="tabpanel"
      id={`language-panel-${item.id}`}
      aria-labelledby={`language-tab-${item.id}`}
      hidden={!selected}
      className={styles.panel}
    >
      <figure className={styles.panelFigure}>
        <img src={shot} alt={item.alt} width="1366" height="768" loading="lazy" decoding="async" />
        <figcaption className={styles.panelCaption}>
          <p>{item.text}</p>
          <Link to={item.to}>{item.reference}</Link>
        </figcaption>
      </figure>
    </div>
  );
}

// The five languages: a tab per language with the real editor capture in the reader's language.
export default function Languages() {
  const { languages } = useLandingPageContent();
  const [active, setActive] = useState(0);
  const tabs = useRef([]);
  const items = languages.items;

  const onKeyDown = (event) => {
    const next = nextTab(event.key, active, items.length);
    if (next === undefined) return;
    event.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  };

  return (
    <section className={styles.section} aria-labelledby="languages-title">
      <div className={styles.wrap}>
        <h2 id="languages-title" className={styles.sectionTitle}>
          {keepStandard(languages.title)}
        </h2>
        <p className={styles.sectionLead}>{withCode(languages.lead)}</p>

        <div className={styles.languageLayout}>
          <div role="tablist" aria-label={languages.tabsLabel} className={styles.tablist} onKeyDown={onKeyDown}>
            {items.map((item, index) => (
              <button
                key={item.id}
                ref={(element) => {
                  tabs.current[index] = element;
                }}
                type="button"
                role="tab"
                id={`language-tab-${item.id}`}
                aria-controls={`language-panel-${item.id}`}
                aria-selected={index === active}
                tabIndex={index === active ? 0 : -1}
                className={styles.tab}
                onClick={() => setActive(index)}
              >
                <span className={styles.tabCode}>{item.code}</span>
                <span className={styles.tabName}>{item.name}</span>
              </button>
            ))}
          </div>
          {items.map((item, index) => (
            <Panel key={item.id} item={item} selected={index === active} />
          ))}
        </div>

        <div className={styles.evidence}>
          <p className={styles.evidenceLabel}>{languages.evidenceLabel}</p>
          <p className={styles.evidenceText}>
            {languages.evidence} <Link to={languages.evidenceTo}>{languages.evidenceLink}</Link>
          </p>
        </div>
      </div>
    </section>
  );
}
