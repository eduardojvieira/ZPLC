import React from 'react';
import Layout from '@theme/Layout';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Hero from '../components/LandingPage/Hero';
import Features from '../components/LandingPage/Features';

export default function Home() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={`${siteConfig.title} - The Industrial Runtime`}
      description="One Execution Core. Any Runtime.">
      <main>
        <Hero />
        <Features />
      </main>
    </Layout>
  );
}
