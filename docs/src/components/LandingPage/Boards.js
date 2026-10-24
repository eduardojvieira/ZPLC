import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import boards from '@site/src/data/boards.json';
import styles from './LandingPage.module.css';
import { useLandingPageContent } from './content';

// The supported boards: the generated illustration of boards on one rail, then the boards of the manifest.
// src/data/boards.json is written by tools/docs/generate_board_reference.py from firmware/app/boards/boards.json, so no board
// is typed here.
export default function Boards() {
  const { boards: text } = useLandingPageContent();
  const { i18n } = useDocusaurusContext();
  const locale = i18n.currentLocale === 'es' ? 'es' : 'en';
  const art = useBaseUrl('/img/generated/boards-on-rail');

  return (
    <section className={styles.section} aria-labelledby="boards-title">
      <div className={styles.wrap}>
        <div className={styles.boardsGrid}>
          <div>
            <h2 id="boards-title" className={styles.sectionTitle}>
              {text.title}
            </h2>
            <p className={styles.sectionLead}>{text.lead}</p>
          </div>
          <span className={styles.boardsArt}>
            {['light', 'dark'].map((theme) => (
              <img
                key={theme}
                className={`zplc-${theme}-only`}
                src={`${art}-${theme}.avif`}
                alt={text.artAlt}
                width="1200"
                height="896"
                loading="lazy"
                decoding="async"
              />
            ))}
          </span>
        </div>

        <div className={styles.boardTable} role="region" aria-labelledby="boards-title" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th scope="col">{text.columns.board}</th>
                <th scope="col">{text.columns.target}</th>
                <th scope="col">{text.columns.network}</th>
              </tr>
            </thead>
            <tbody>
              {boards.map((board) => (
                <tr key={board.board_id}>
                  <th scope="row">
                    {board.display_name}
                    {board.learner && <span className={styles.learnerTag}>{text.learner}</span>}
                  </th>
                  <td>
                    <code>{board.zephyr_board}</code>
                  </td>
                  <td>{board.network[locale]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className={styles.boardsReport}>{text.report}</p>
        <p className={styles.links}>
          {text.links.map((link) => (
            <Link key={link.label} {...(link.href ? { href: link.href } : { to: link.to })}>
              {link.label}
            </Link>
          ))}
        </p>
      </div>
    </section>
  );
}
