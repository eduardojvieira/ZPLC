import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import boards from '@site/src/data/boards.json';
import styles from './LandingPage.module.css';
import { useLandingPageContent } from './content';

// The boards of the manifest at the level their evidence gives. src/data/boards.json is written by
// tools/docs/generate_board_reference.py from firmware/app/boards/boards.json, so no board or level is typed here. The
// levels are drawn as a ladder of steps, each with the number of boards that stand on it.
export default function Boards() {
  const { boards: text } = useLandingPageContent();
  const { i18n } = useDocusaurusContext();
  const locale = i18n.currentLocale === 'es' ? 'es' : 'en';

  return (
    <section className={styles.section} aria-labelledby="boards-title">
      <div className={styles.wrap}>
        <h2 id="boards-title" className={styles.sectionTitle}>
          {text.title}
        </h2>
        <p className={styles.sectionLead}>{text.lead}</p>

        <ol className={styles.levels}>
          {text.levels.map((level) => {
            const count = boards.filter((board) => board.level === level.id).length;
            return (
              <li key={level.id} className={styles.level} data-reached={count > 0 || undefined}>
                <span className={styles.levelCount} aria-hidden="true">
                  {count}
                </span>
                <code className={styles.levelName}>{level.id}</code>
                <span className={styles.levelText}>{level.text}</span>
              </li>
            );
          })}
        </ol>

        <div className={styles.boardTable} role="region" aria-labelledby="boards-title" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th scope="col">{text.columns.board}</th>
                <th scope="col">{text.columns.target}</th>
                <th scope="col">{text.columns.network}</th>
                <th scope="col">{text.columns.level}</th>
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
                  <td>
                    <code>{board.level}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

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
