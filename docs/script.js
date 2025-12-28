const translations = {
    en: {
        nav_features: "Features",
        nav_architecture: "Architecture",
        nav_quickstart: "Quick Start",
        hero_title: "One Execution Core,<br>Any Runtime.",
        hero_subtitle: "Portable, deterministic PLC runtime powered by Zephyr RTOS. Bring modern software development practices to industrial automation.",
        cta_start: "Get Started",
        stat_boards: "Boards",
        stat_license: "Open Source",
        features_title: "Key Features",
        feat_portable_title: "Portable Core",
        feat_portable_desc: "ANSI C99 compliant core running on Zephyr, Linux, Windows, and WebAssembly.",
        feat_ide_title: "Visual IDE",
        feat_ide_desc: "Web-based editor for Ladder (LD), Function Block (FBD), and SFC workflows.",
        feat_industrial_title: "Industrial Grade",
        feat_industrial_desc: "Deterministic execution with sub-millisecond jitter on RTOS targets.",
        feat_connectivity_title: "Unified Architecture",
        feat_connectivity_desc: "Hardware-agnostic .zplc bytecode. Compile once, run on any supported hardware.",
        arch_title: "Architecture",
        qs_title: "Quick Start",
        qs_step1_title: "1. POSIX Build (Testing)",
        qs_step1_desc: "Build and test the core on your host machine:",
        qs_step2_title: "2. Zephyr Build (Embedded)",
        qs_step2_desc: "Run on real hardware or QEMU:",
        footer_desc: "Open source PLC runtime for the modern era."
    },
    es: {
        nav_features: "Características",
        nav_architecture: "Arquitectura",
        nav_quickstart: "Inicio Rápido",
        hero_title: "Un Núcleo de Ejecución,<br>Cualquier Runtime.",
        hero_subtitle: "Runtime de PLC portátil y determinista impulsado por Zephyr RTOS. Trae las prácticas modernas de desarrollo de software a la automatización industrial.",
        cta_start: "Comenzar",
        stat_boards: "Placas",
        stat_license: "Código Abierto",
        features_title: "Características Principales",
        feat_portable_title: "Núcleo Portátil",
        feat_portable_desc: "Núcleo compatible con ANSI C99 que se ejecuta en Zephyr, Linux, Windows y WebAssembly.",
        feat_ide_title: "IDE Visual",
        feat_ide_desc: "Editor web para diagramas Ladder (LD), Bloques de Función (FBD) y SFC.",
        feat_industrial_title: "Grado Industrial",
        feat_industrial_desc: "Ejecución determinista con jitter sub-milisegundo en objetivos RTOS.",
        feat_connectivity_title: "Arquitectura Unificada",
        feat_connectivity_desc: "Bytecode .zplc agnóstico del hardware. Compila una vez, ejecuta en cualquier hardware compatible.",
        arch_title: "Arquitectura",
        qs_title: "Inicio Rápido",
        qs_step1_title: "1. Compilación POSIX (Pruebas)",
        qs_step1_desc: "Compila y prueba el núcleo en tu máquina host:",
        qs_step2_title: "2. Compilación Zephyr (Integrado)",
        qs_step2_desc: "Ejecutar en hardware real o QEMU:",
        footer_desc: "Runtime de PLC de código abierto para la era moderna."
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const langToggleBtn = document.getElementById('lang-toggle');
    const langText = langToggleBtn.querySelector('.lang-text');
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');

    // Check for saved language or default to browser language/en
    const userLang = localStorage.getItem('zplc_lang') || 'en';
    setLanguage(userLang);

    langToggleBtn.addEventListener('click', () => {
        const currentLang = localStorage.getItem('zplc_lang') || 'en';
        const newLang = currentLang === 'en' ? 'es' : 'en';
        setLanguage(newLang);
    });

    mobileMenuBtn.addEventListener('click', () => {
        navLinks.classList.toggle('active');
    });

    function setLanguage(lang) {
        localStorage.setItem('zplc_lang', lang);

        // Update button text
        langText.textContent = lang === 'en' ? 'ES' : 'EN';

        // Update content
        const elements = document.querySelectorAll('[data-i18n]');
        elements.forEach(element => {
            const key = element.getAttribute('data-i18n');
            if (translations[lang] && translations[lang][key]) {
                if (key === 'hero_title') {
                    // Handle HTML content for specific keys
                    element.innerHTML = translations[lang][key];
                } else {
                    element.textContent = translations[lang][key];
                }
            }
        });

        // Set html lang attribute
        document.documentElement.lang = lang;
    }
});
