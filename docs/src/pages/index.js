import Layout from '@theme/Layout';
import Boards from '../components/LandingPage/Boards';
import Closing from '../components/LandingPage/Closing';
import Debug from '../components/LandingPage/Debug';
import Hero from '../components/LandingPage/Hero';
import Languages from '../components/LandingPage/Languages';
import Learn from '../components/LandingPage/Learn';
import Portability from '../components/LandingPage/Portability';
import Specs from '../components/LandingPage/Specs';
import styles from '../components/LandingPage/LandingPage.module.css';
import { useLandingPageContent } from '../components/LandingPage/content';

export default function Home() {
  const { home } = useLandingPageContent();

  return (
    <Layout title={home.metaTitle} description={home.metaDescription}>
      <main className={styles.page}>
        <Hero />
        <Portability />
        <Boards />
        <Languages />
        <Debug />
        <Learn />
        <Specs />
        <Closing />
      </main>
    </Layout>
  );
}
