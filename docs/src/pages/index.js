import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Hero from '../components/LandingPage/Hero';
import Features from '../components/LandingPage/Features';
import { getLandingPageContent } from '../components/LandingPage/content';

export default function Home() {
  const { i18n } = useDocusaurusContext();
  const content = getLandingPageContent(i18n.currentLocale);

  return (
    <Layout title={content.home.metaTitle} description={content.home.metaDescription}>
      <main>
        <Hero />
        <Features />
      </main>
    </Layout>
  );
}
