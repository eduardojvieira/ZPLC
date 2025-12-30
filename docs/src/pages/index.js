import Layout from '@theme/Layout';
import Hero from '../components/LandingPage/Hero';
import Features from '../components/LandingPage/Features';

export default function Home() {
    return (
        <Layout
            title="Open Source PLC Runtime"
            description="ZPLC - The deterministic, portable, and secure IEC 61131-3 compatible runtime for modern industrial automation. Runs on Zephyr RTOS, Linux, Windows, and WebAssembly.">
            <main>
                <Hero />
                <Features />
            </main>
        </Layout>
    );
}
