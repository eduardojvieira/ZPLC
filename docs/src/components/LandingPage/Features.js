import React from 'react';
import styles from './LandingPage.module.css';
import Translate from '@docusaurus/Translate';
import Link from '@docusaurus/Link';

function FeatureCard({ icon, title, description, features, accentColor }) {
    return (
        <div className={styles.featureCard} style={{ '--accent-color': accentColor }}>
            <div className={styles.featureCardIcon}>{icon}</div>
            <h3 className={styles.featureCardTitle}>{title}</h3>
            <p className={styles.featureCardDescription}>{description}</p>
            <ul className={styles.featureCardList}>
                {features.map((feature, idx) => (
                    <li key={idx} className={styles.featureCardListItem}>
                        <span className={styles.checkIcon}>✓</span>
                        {feature}
                    </li>
                ))}
            </ul>
        </div>
    );
}

function RuntimeSection() {
    return (
        <section className={styles.section} id="runtime">
            <div className={styles.sectionHeader}>
                <span className={styles.sectionLabel}>
                    <Translate id="homepage.runtime.label">RUNTIME ENGINE</Translate>
                </span>
                <h2 className={styles.sectionTitle}>
                    <Translate id="homepage.runtime.title">Portable. Deterministic. Secure.</Translate>
                </h2>
                <p className={styles.sectionSubtitle}>
                    <Translate id="homepage.runtime.subtitle">
                        The ZPLC Core is a lightweight, stack-based bytecode interpreter written in ANSI C99.
                        It abstracts the underlying hardware through a clean HAL interface.
                    </Translate>
                </p>
            </div>
            
            <div className={styles.runtimeGrid}>
                <div className={styles.runtimeVisual}>
                    <div className={styles.architectureDiagram}>
                        <div className={styles.archLayer} style={{ '--layer-color': '#22d3ee' }}>
                            <span className={styles.archLayerLabel}>IEC 61131-3 Programs</span>
                            <span className={styles.archLayerSub}>LD • FBD • ST • SFC</span>
                        </div>
                        <div className={styles.archArrow}>↓</div>
                        <div className={styles.archLayer} style={{ '--layer-color': '#a855f7' }}>
                            <span className={styles.archLayerLabel}>ZPLC Bytecode</span>
                            <span className={styles.archLayerSub}>63 Instructions • Stack VM</span>
                        </div>
                        <div className={styles.archArrow}>↓</div>
                        <div className={styles.archLayer} style={{ '--layer-color': '#f59e0b' }}>
                            <span className={styles.archLayerLabel}>Hardware Abstraction Layer</span>
                            <span className={styles.archLayerSub}>GPIO • ADC • DAC • Timers</span>
                        </div>
                        <div className={styles.archArrow}>↓</div>
                        <div className={styles.archTargets}>
                            <div className={styles.archTarget}>Zephyr</div>
                            <div className={styles.archTarget}>Linux</div>
                            <div className={styles.archTarget}>Windows</div>
                            <div className={styles.archTarget}>WASM</div>
                        </div>
                    </div>
                </div>
                
                <div className={styles.runtimeFeatures}>
                    <div className={styles.runtimeFeature}>
                        <div className={styles.runtimeFeatureIcon}>⚡</div>
                        <div className={styles.runtimeFeatureContent}>
                            <h4><Translate id="homepage.runtime.feature1.title">Real-Time Execution</Translate></h4>
                            <p><Translate id="homepage.runtime.feature1.desc">Deterministic scan cycles with sub-millisecond jitter on RTOS targets. Predictable timing for safety-critical applications.</Translate></p>
                        </div>
                    </div>
                    <div className={styles.runtimeFeature}>
                        <div className={styles.runtimeFeatureIcon}>🔒</div>
                        <div className={styles.runtimeFeatureContent}>
                            <h4><Translate id="homepage.runtime.feature2.title">Memory Safe</Translate></h4>
                            <p><Translate id="homepage.runtime.feature2.desc">Sandboxed execution with bounds-checked memory access. The VM cannot corrupt the host system.</Translate></p>
                        </div>
                    </div>
                    <div className={styles.runtimeFeature}>
                        <div className={styles.runtimeFeatureIcon}>📦</div>
                        <div className={styles.runtimeFeatureContent}>
                            <h4><Translate id="homepage.runtime.feature3.title">Minimal Footprint</Translate></h4>
                            <p><Translate id="homepage.runtime.feature3.desc">Only 44KB Flash and 8KB RAM required. Runs on resource-constrained microcontrollers.</Translate></p>
                        </div>
                    </div>
                    <div className={styles.runtimeFeature}>
                        <div className={styles.runtimeFeatureIcon}>🔄</div>
                        <div className={styles.runtimeFeatureContent}>
                            <h4><Translate id="homepage.runtime.feature4.title">Hot Reload</Translate></h4>
                            <p><Translate id="homepage.runtime.feature4.desc">Update program logic without restarting the runtime. Retentive memory survives across updates.</Translate></p>
                        </div>
                    </div>
                </div>
            </div>
            
            <div className={styles.codeShowcase}>
                <div className={styles.codeBlock}>
                    <div className={styles.codeHeader}>
                        <span className={styles.codeDot} style={{ background: '#ff5f56' }}></span>
                        <span className={styles.codeDot} style={{ background: '#ffbd2e' }}></span>
                        <span className={styles.codeDot} style={{ background: '#27ca40' }}></span>
                        <span className={styles.codeTitle}>main.c — ZPLC Runtime Loop</span>
                    </div>
                    <pre className={styles.codeContent}>
{`#include "zplc_core.h"
#include "zplc_hal.h"

int main(void) {
    zplc_vm_t vm;
    zplc_vm_init(&vm);
    zplc_vm_load(&vm, program_bytecode, sizeof(program_bytecode));
    
    while (zplc_vm_running(&vm)) {
        zplc_hal_read_inputs(vm.memory + IPI_BASE);   // < 10μs
        zplc_vm_cycle(&vm);                            // Deterministic
        zplc_hal_write_outputs(vm.memory + OPI_BASE); // < 10μs
        zplc_hal_sync(CYCLE_TIME_MS);                  // Jitter-free
    }
    return 0;
}`}
                    </pre>
                </div>
            </div>
        </section>
    );
}

function IDESection() {
    return (
        <section className={`${styles.section} ${styles.sectionAlt}`} id="ide">
            <div className={styles.sectionHeader}>
                <span className={styles.sectionLabel}>
                    <Translate id="homepage.ide.label">WEB-BASED IDE</Translate>
                </span>
                <h2 className={styles.sectionTitle}>
                    <Translate id="homepage.ide.title">Engineer from Anywhere</Translate>
                </h2>
                <p className={styles.sectionSubtitle}>
                    <Translate id="homepage.ide.subtitle">
                        A modern, browser-based development environment. No installation required.
                        Connect to your hardware via WebSerial and debug in real-time.
                    </Translate>
                </p>
            </div>
            
            <div className={styles.ideShowcase}>
                <div className={styles.ideScreenshot}>
                    <IDEMockup />
                </div>
                
                <div className={styles.ideFeatures}>
                    <div className={styles.ideFeatureCard}>
                        <div className={styles.ideFeatureIcon}>🎨</div>
                        <h4><Translate id="homepage.ide.feature1.title">Visual Editors</Translate></h4>
                        <p><Translate id="homepage.ide.feature1.desc">Drag-and-drop Ladder Diagram (LD), Function Block Diagram (FBD), and Sequential Function Chart (SFC) editors.</Translate></p>
                    </div>
                    <div className={styles.ideFeatureCard}>
                        <div className={styles.ideFeatureIcon}>📝</div>
                        <h4><Translate id="homepage.ide.feature2.title">Structured Text</Translate></h4>
                        <p><Translate id="homepage.ide.feature2.desc">Full ST compiler with syntax highlighting, auto-completion, and real-time error checking.</Translate></p>
                    </div>
                    <div className={styles.ideFeatureCard}>
                        <div className={styles.ideFeatureIcon}>🔌</div>
                        <h4><Translate id="homepage.ide.feature3.title">Hardware Connection</Translate></h4>
                        <p><Translate id="homepage.ide.feature3.desc">Connect via WebSerial or WebSocket. Upload programs and monitor variables live.</Translate></p>
                    </div>
                    <div className={styles.ideFeatureCard}>
                        <div className={styles.ideFeatureIcon}>🧪</div>
                        <h4><Translate id="homepage.ide.feature4.title">WASM Simulation</Translate></h4>
                        <p><Translate id="homepage.ide.feature4.desc">Test your logic in the browser before deploying. Full cycle-accurate simulation.</Translate></p>
                    </div>
                </div>
            </div>
        </section>
    );
}

function IDEMockup() {
    return (
        <svg viewBox="0 0 800 500" className={styles.ideSvg}>
            <defs>
                <linearGradient id="ideGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#1a1a2e" />
                    <stop offset="100%" stopColor="#16213e" />
                </linearGradient>
                <filter id="glow">
                    <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                    <feMerge>
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                </filter>
            </defs>
            
            {/* Window Frame */}
            <rect width="800" height="500" rx="12" fill="url(#ideGrad)" />
            
            {/* Title Bar */}
            <rect x="0" y="0" width="800" height="40" rx="12" fill="#0f0f1a" />
            <rect x="0" y="20" width="800" height="20" fill="#0f0f1a" />
            <circle cx="20" cy="20" r="6" fill="#ff5f56" />
            <circle cx="44" cy="20" r="6" fill="#ffbd2e" />
            <circle cx="68" cy="20" r="6" fill="#27ca40" />
            <text x="400" y="25" fill="#888" fontSize="13" textAnchor="middle" fontFamily="system-ui">ZPLC IDE — motor_control.ld</text>
            
            {/* Sidebar */}
            <rect x="0" y="40" width="200" height="460" fill="#12121f" />
            <text x="20" y="70" fill="#666" fontSize="11" fontFamily="system-ui">EXPLORER</text>
            <rect x="10" y="85" width="180" height="28" rx="4" fill="#1e1e2e" />
            <text x="40" y="104" fill="#22d3ee" fontSize="12" fontFamily="monospace">📁 motor_control</text>
            <text x="50" y="130" fill="#aaa" fontSize="12" fontFamily="monospace">📄 main.ld</text>
            <text x="50" y="152" fill="#666" fontSize="12" fontFamily="monospace">📄 safety.st</text>
            <text x="50" y="174" fill="#666" fontSize="12" fontFamily="monospace">📄 io_config.yaml</text>
            
            <text x="20" y="210" fill="#666" fontSize="11" fontFamily="system-ui">VARIABLES</text>
            <text x="30" y="235" fill="#22d3ee" fontSize="11" fontFamily="monospace">● Motor_Running</text>
            <text x="160" y="235" fill="#27ca40" fontSize="11" fontFamily="monospace">TRUE</text>
            <text x="30" y="255" fill="#a855f7" fontSize="11" fontFamily="monospace">● Speed_Setpoint</text>
            <text x="160" y="255" fill="#f59e0b" fontSize="11" fontFamily="monospace">1500</text>
            <text x="30" y="275" fill="#22d3ee" fontSize="11" fontFamily="monospace">● Emergency_Stop</text>
            <text x="160" y="275" fill="#666" fontSize="11" fontFamily="monospace">FALSE</text>
            
            {/* Main Editor Area */}
            <rect x="200" y="40" width="600" height="380" fill="#1e1e2e" />
            
            {/* Toolbar */}
            <rect x="200" y="40" width="600" height="35" fill="#252536" />
            <rect x="215" y="50" width="60" height="18" rx="3" fill="#22d3ee" opacity="0.2" />
            <text x="245" y="63" fill="#22d3ee" fontSize="10" textAnchor="middle">Ladder</text>
            <rect x="285" y="50" width="45" height="18" rx="3" fill="transparent" />
            <text x="307" y="63" fill="#666" fontSize="10" textAnchor="middle">FBD</text>
            <rect x="340" y="50" width="35" height="18" rx="3" fill="transparent" />
            <text x="357" y="63" fill="#666" fontSize="10" textAnchor="middle">ST</text>
            
            {/* Ladder Diagram Content */}
            {/* Rung 1 */}
            <text x="220" y="105" fill="#666" fontSize="12" fontFamily="monospace">001</text>
            <line x1="250" y1="100" x2="780" y2="100" stroke="#444" strokeWidth="2" />
            <line x1="250" y1="100" x2="250" y2="140" stroke="#444" strokeWidth="2" />
            <line x1="780" y1="100" x2="780" y2="140" stroke="#444" strokeWidth="2" />
            
            {/* NO Contact - Start_Button */}
            <rect x="290" y="88" width="70" height="24" fill="none" stroke="#22d3ee" strokeWidth="2" filter="url(#glow)" />
            <text x="325" y="105" fill="#22d3ee" fontSize="11" textAnchor="middle" fontFamily="monospace">Start_PB</text>
            
            {/* NC Contact - Emergency_Stop */}
            <rect x="400" y="88" width="70" height="24" fill="none" stroke="#22d3ee" strokeWidth="2" />
            <line x1="420" y1="83" x2="450" y2="117" stroke="#22d3ee" strokeWidth="2" />
            <text x="435" y="105" fill="#22d3ee" fontSize="11" textAnchor="middle" fontFamily="monospace">E_Stop</text>
            
            {/* TON Timer */}
            <rect x="510" y="82" width="90" height="36" fill="#1a1a2e" stroke="#f59e0b" strokeWidth="2" />
            <text x="555" y="98" fill="#f59e0b" fontSize="10" textAnchor="middle" fontFamily="monospace">TON</text>
            <text x="555" y="112" fill="#888" fontSize="9" textAnchor="middle" fontFamily="monospace">T#2s</text>
            
            {/* Coil - Motor_Running */}
            <circle cx="700" cy="100" r="14" fill="none" stroke="#a855f7" strokeWidth="2" filter="url(#glow)" />
            <text x="700" y="104" fill="#a855f7" fontSize="10" textAnchor="middle" fontFamily="monospace">M</text>
            <text x="700" y="130" fill="#a855f7" fontSize="9" textAnchor="middle">Motor_Run</text>
            
            {/* Rung 2 */}
            <text x="220" y="175" fill="#666" fontSize="12" fontFamily="monospace">002</text>
            <line x1="250" y1="170" x2="780" y2="170" stroke="#444" strokeWidth="2" />
            <line x1="250" y1="170" x2="250" y2="210" stroke="#444" strokeWidth="2" />
            <line x1="780" y1="170" x2="780" y2="210" stroke="#444" strokeWidth="2" />
            
            <rect x="290" y="158" width="70" height="24" fill="none" stroke="#22d3ee" strokeWidth="2" />
            <text x="325" y="175" fill="#22d3ee" fontSize="11" textAnchor="middle" fontFamily="monospace">Motor_Run</text>
            
            {/* Comparator */}
            <rect x="400" y="152" width="90" height="36" fill="#1a1a2e" stroke="#22d3ee" strokeWidth="2" />
            <text x="445" y="168" fill="#22d3ee" fontSize="10" textAnchor="middle" fontFamily="monospace">GE</text>
            <text x="445" y="182" fill="#888" fontSize="9" textAnchor="middle" fontFamily="monospace">Speed≥100</text>
            
            <circle cx="700" cy="170" r="14" fill="none" stroke="#27ca40" strokeWidth="2" />
            <text x="700" y="174" fill="#27ca40" fontSize="10" textAnchor="middle" fontFamily="monospace">Y</text>
            <text x="700" y="200" fill="#27ca40" fontSize="9" textAnchor="middle">Run_Light</text>
            
            {/* Rung 3 */}
            <text x="220" y="245" fill="#666" fontSize="12" fontFamily="monospace">003</text>
            <line x1="250" y1="240" x2="780" y2="240" stroke="#444" strokeWidth="2" />
            <line x1="250" y1="240" x2="250" y2="280" stroke="#444" strokeWidth="2" />
            <line x1="780" y1="240" x2="780" y2="280" stroke="#444" strokeWidth="2" />
            
            <rect x="290" y="228" width="70" height="24" fill="none" stroke="#22d3ee" strokeWidth="2" />
            <text x="325" y="245" fill="#22d3ee" fontSize="11" textAnchor="middle" fontFamily="monospace">Stop_PB</text>
            
            <rect x="520" y="228" width="50" height="24" fill="none" stroke="#ff6b6b" strokeWidth="2" />
            <text x="545" y="245" fill="#ff6b6b" fontSize="11" textAnchor="middle" fontFamily="monospace">R</text>
            <text x="545" y="270" fill="#ff6b6b" fontSize="9" textAnchor="middle">Motor_Run</text>
            
            {/* Console */}
            <rect x="200" y="420" width="600" height="80" fill="#0a0a12" />
            <text x="215" y="440" fill="#666" fontSize="11" fontFamily="system-ui">CONSOLE</text>
            <text x="215" y="460" fill="#22c55e" fontSize="11" fontFamily="monospace">[14:32:05] Connected to PLC @ 192.168.1.100</text>
            <text x="215" y="478" fill="#22d3ee" fontSize="11" fontFamily="monospace">[14:32:05] Program uploaded successfully (1.2KB)</text>
            <text x="215" y="496" fill="#888" fontSize="11" fontFamily="monospace">[14:32:06] Cycle time: 10ms | Status: RUN | Scan: 847μs</text>
        </svg>
    );
}

function UseCasesSection() {
    const useCases = [
        {
            icon: "🏭",
            title: <Translate id="homepage.usecases.manufacturing.title">Manufacturing</Translate>,
            description: <Translate id="homepage.usecases.manufacturing.desc">Production line control, conveyor systems, and packaging machines with deterministic timing.</Translate>
        },
        {
            icon: "🌡️",
            title: <Translate id="homepage.usecases.hvac.title">Building Automation</Translate>,
            description: <Translate id="homepage.usecases.hvac.desc">HVAC control, lighting systems, and energy management with network connectivity.</Translate>
        },
        {
            icon: "💧",
            title: <Translate id="homepage.usecases.water.title">Water Treatment</Translate>,
            description: <Translate id="homepage.usecases.water.desc">Pump control, chemical dosing, and level monitoring with safety interlocks.</Translate>
        },
        {
            icon: "⚡",
            title: <Translate id="homepage.usecases.energy.title">Energy Systems</Translate>,
            description: <Translate id="homepage.usecases.energy.desc">Solar inverters, battery management, and grid synchronization control.</Translate>
        },
        {
            icon: "🚜",
            title: <Translate id="homepage.usecases.agriculture.title">Agriculture</Translate>,
            description: <Translate id="homepage.usecases.agriculture.desc">Irrigation control, greenhouse automation, and livestock monitoring.</Translate>
        },
        {
            icon: "🔬",
            title: <Translate id="homepage.usecases.lab.title">Laboratory</Translate>,
            description: <Translate id="homepage.usecases.lab.desc">Test equipment control, data acquisition, and experiment automation.</Translate>
        }
    ];
    
    return (
        <section className={styles.section} id="use-cases">
            <div className={styles.sectionHeader}>
                <span className={styles.sectionLabel}>
                    <Translate id="homepage.usecases.label">USE CASES</Translate>
                </span>
                <h2 className={styles.sectionTitle}>
                    <Translate id="homepage.usecases.title">Built for Industrial Applications</Translate>
                </h2>
                <p className={styles.sectionSubtitle}>
                    <Translate id="homepage.usecases.subtitle">
                        From factory floors to research labs, ZPLC powers automation across industries.
                    </Translate>
                </p>
            </div>
            
            <div className={styles.useCasesGrid}>
                {useCases.map((useCase, idx) => (
                    <div key={idx} className={styles.useCaseCard}>
                        <span className={styles.useCaseIcon}>{useCase.icon}</span>
                        <h4 className={styles.useCaseTitle}>{useCase.title}</h4>
                        <p className={styles.useCaseDesc}>{useCase.description}</p>
                    </div>
                ))}
            </div>
        </section>
    );
}

function ArchitectureSection() {
    return (
        <section className={`${styles.section} ${styles.sectionAlt}`} id="architecture">
            <div className={styles.sectionHeader}>
                <span className={styles.sectionLabel}>
                    <Translate id="homepage.arch.label">ARCHITECTURE</Translate>
                </span>
                <h2 className={styles.sectionTitle}>
                    <Translate id="homepage.arch.title">How It Works</Translate>
                </h2>
            </div>
            
            <div className={styles.archFlow}>
                <div className={styles.archFlowStep}>
                    <div className={styles.archFlowIcon}>📝</div>
                    <h4><Translate id="homepage.arch.step1.title">Design</Translate></h4>
                    <p><Translate id="homepage.arch.step1.desc">Create logic using Ladder, FBD, or Structured Text in the browser-based IDE.</Translate></p>
                </div>
                <div className={styles.archFlowArrow}>→</div>
                <div className={styles.archFlowStep}>
                    <div className={styles.archFlowIcon}>⚙️</div>
                    <h4><Translate id="homepage.arch.step2.title">Compile</Translate></h4>
                    <p><Translate id="homepage.arch.step2.desc">The compiler generates optimized ZPLC bytecode from your source.</Translate></p>
                </div>
                <div className={styles.archFlowArrow}>→</div>
                <div className={styles.archFlowStep}>
                    <div className={styles.archFlowIcon}>🧪</div>
                    <h4><Translate id="homepage.arch.step3.title">Simulate</Translate></h4>
                    <p><Translate id="homepage.arch.step3.desc">Test in the browser using WebAssembly before deploying.</Translate></p>
                </div>
                <div className={styles.archFlowArrow}>→</div>
                <div className={styles.archFlowStep}>
                    <div className={styles.archFlowIcon}>🚀</div>
                    <h4><Translate id="homepage.arch.step4.title">Deploy</Translate></h4>
                    <p><Translate id="homepage.arch.step4.desc">Upload to target hardware via Serial or Network connection.</Translate></p>
                </div>
            </div>
        </section>
    );
}

function CTASection() {
    return (
        <section className={styles.ctaSection}>
            <div className={styles.ctaContent}>
                <h2 className={styles.ctaTitle}>
                    <Translate id="homepage.cta.title">Ready to Get Started?</Translate>
                </h2>
                <p className={styles.ctaSubtitle}>
                    <Translate id="homepage.cta.subtitle">
                        ZPLC is open source and free to use. Check out the documentation or dive into the code.
                    </Translate>
                </p>
                <div className={styles.ctaButtons}>
                    <Link className={`button button--primary button--lg ${styles.ctaButton}`} to="/docs/runtime/intro">
                        <Translate id="homepage.cta.docs">Read the Docs</Translate>
                    </Link>
                    <a className={`button button--secondary button--lg ${styles.ctaButton}`} href="https://github.com/eduardojvieira/ZPLC" target="_blank" rel="noopener noreferrer">
                        <Translate id="homepage.cta.github">View on GitHub</Translate>
                    </a>
                </div>
            </div>
        </section>
    );
}

export default function Features() {
    return (
        <>
            <RuntimeSection />
            <IDESection />
            <UseCasesSection />
            <ArchitectureSection />
            <CTASection />
        </>
    );
}
