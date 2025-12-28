import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

const FeatureList = [
  {
    title: 'Portable Runtime',
    Svg: require('@site/static/img/logo.svg').default,
    description: (
      <>
        ANSI C99 core running on Zephyr RTOS, Linux, Windows, and WebAssembly.
        Deploy your logic to any architecture.
      </>
    ),
  },
  {
    title: 'Visual Engineering',
    Svg: require('@site/static/img/logo.svg').default,
    description: (
      <>
        Web-based IDE supporting Ladder (LD), Function Block (FBD), and SFC workflows.
        Modern tools for industrial automation.
      </>
    ),
  },
  {
    title: 'Industrial Determinism',
    Svg: require('@site/static/img/logo.svg').default,
    description: (
      <>
        Designed for real-time control with predictable execution and sub-millisecond jitter
        on supported RTOS hardware.
      </>
    ),
  },
];

function Feature({ Svg, title, description }) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <Svg className={styles.featureSvg} role="img" />
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures() {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
