import Layout from '@theme/Layout';
import Different from '../components/LandingPage/Different';
import Hero from '../components/LandingPage/Hero';
import Languages from '../components/LandingPage/Languages';
import Learn from '../components/LandingPage/Learn';
import styles from '../components/LandingPage/LandingPage.module.css';
import { useLandingPageContent } from '../components/LandingPage/content';

export default function Home() {
  const { home } = useLandingPageContent();

  return (
    <Layout title={home.metaTitle} description={home.metaDescription}>
      <main className={styles.page}>
        <Hero />
        <Different />
        <Languages />
        <Learn />
      </main>
    </Layout>
  );
}
