import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import { useEffect, useState } from 'react';
import styles from '../components/DownloadPage/DownloadPage.module.css';
import { SYSTEMS, detectSystem, featuredSystems, fileName } from '../components/DownloadPage/downloads';
import landing from '../components/LandingPage/LandingPage.module.css';
import { releasesUrl, useLandingPageContent } from '../components/LandingPage/content';

const installPage = '/docs/getting-started/install';

/** The system of the browser, once it is known: undefined while the page renders on the server. */
function useDetectedSystem() {
  const [detected, setDetected] = useState(undefined);
  useEffect(() => {
    const read = (architecture) =>
      setDetected(detectSystem({ userAgent: navigator.userAgent, architecture, maxTouchPoints: navigator.maxTouchPoints }));
    read('');
    // Chromium reports the processor; every other browser keeps the first reading
    navigator.userAgentData?.getHighEntropyValues?.(['architecture']).then(
      (values) => read(values.architecture ?? ''),
      () => {},
    );
  }, []);
  return detected;
}

function Options({ system, version, tag, text }) {
  return (
    <div className={styles.system}>
      <h2 className={styles.systemName}>{text.systems[system.key]}</h2>
      <ul className={styles.options}>
        {system.formats.map((format, index) => {
          const name = fileName(version, format, system.arch);
          return (
            <li key={format}>
              <a className={index === 0 ? landing.pathAction : styles.secondary} href={`${releasesUrl}/download/${tag}/${name}`}>
                {text.formats[format]}
              </a>
              <code className={styles.file}>{name}</code>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Featured({ detected, version, tag, text }) {
  if (detected === undefined) return <div className={styles.featured} />;
  const systems = featuredSystems(detected);
  if (systems.length === 0)
    return (
      <div className={styles.featured}>
        <p className={styles.hint}>{text.undetected}</p>
      </div>
    );
  const { os } = detected;
  return (
    <div className={styles.featured}>
      <p className={styles.detected}>{text.detectedLabel}</p>
      {systems.map((system) => (
        <Options key={system.key} system={system} version={version} tag={tag} text={text} />
      ))}
      {systems.length > 1 && <p className={styles.hint}>{text.macChooser}</p>}
      <p className={styles.note}>
        {text.notes[os]} <Link to={`${installPage}#${os}`}>{text.firstLaunch[os]}</Link>
      </p>
      <p className={styles.note}>
        <a href="#all">{text.otherSystems}</a>
      </p>
    </div>
  );
}

export default function Download() {
  const { siteConfig } = useDocusaurusContext();
  const tag = siteConfig.customFields.releaseTag;
  const version = tag.replace(/^v/, '');
  const text = useLandingPageContent().download;
  const detected = useDetectedSystem();
  const sums = `${releasesUrl}/download/${tag}/SHA256SUMS`;

  return (
    <Layout title={text.metaTitle} description={text.description}>
      <main className={landing.page}>
        <section className={`${landing.wrap} ${styles.top}`}>
          <h1 className={styles.title}>{text.title}</h1>
          <p className={styles.version}>
            {text.versionLabel} {version}
          </p>
          <p className={landing.sectionLead}>{text.lead}</p>
          <Featured detected={detected} version={version} tag={tag} text={text} />
        </section>

        <section className={landing.section} id="all">
          <div className={landing.wrap}>
            <h2 className={styles.sectionTitle}>{text.all.title}</h2>
            <div className={styles.table}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">{text.all.system}</th>
                    <th scope="col">{text.all.files}</th>
                  </tr>
                </thead>
                <tbody>
                  {SYSTEMS.map((system) => (
                    <tr key={system.key}>
                      <th scope="row">{text.systems[system.key]}</th>
                      <td>
                        <ul className={styles.files}>
                          {system.formats.map((format) => {
                            const name = fileName(version, format, system.arch);
                            return (
                              <li key={format}>
                                <a href={`${releasesUrl}/download/${tag}/${name}`}>{text.formats[format]}</a>
                                <code className={styles.file}>{name}</code>
                              </li>
                            );
                          })}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={styles.columns}>
              <div>
                <h2 className={styles.sectionTitle}>{text.verify.title}</h2>
                <p className={styles.note}>
                  {text.verify.text} <a href={sums}>SHA256SUMS</a>.{' '}
                  <Link to={`${installPage}#${text.verify.anchor}`}>{text.verify.how}</Link>
                </p>
              </div>
              <div>
                <h2 className={styles.sectionTitle}>{text.more.title}</h2>
                <p className={styles.note}>
                  {text.more.text} <a href={`${releasesUrl}/tag/${tag}`}>{text.more.link}</a>
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
