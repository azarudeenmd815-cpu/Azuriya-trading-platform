export const siteLanguages = [
  { code: "en", name: "English" },
  { code: "pt", name: "Português" },
  { code: "es", name: "Español" },
  { code: "hi", name: "हिन्दी" },
  { code: "ar", name: "العربية" },
  { code: "bn", name: "বাংলা" },
  { code: "fr", name: "Français" },
  { code: "ru", name: "Русский" },
  { code: "ur", name: "اردو" },
  { code: "zh", name: "中文" },
] as const;

export type SiteLanguage = (typeof siteLanguages)[number]["code"];

export const siteLanguageStorageKey = "azuriya:language";
export const siteLanguageEvent = "azuriya:site-language-change";
export const sitePreferencesOpenEvent = "azuriya:open-site-preferences";

export const localizedUi: Record<
  SiteLanguage,
  {
    changeLanguage: string;
    navigation: [string, string, string, string, string, string];
    closeNavigation: string;
    openNavigation: string;
    eyebrow: string;
    headingOne: string;
    headingTwo: string;
    headingThree: string;
    heroDescription: string;
    explorePortal: string;
    seeCompleteSolution: string;
    mt5Deposit: string;
    welcomeTitle: string;
    welcomeDescription: string;
    languageLabel: string;
    suggestedLanguage: string;
    cookiesTitle: string;
    cookiesDescription: string;
    essentialCookies: string;
    essentialDescription: string;
    optionalCookies: string;
    optionalDescription: string;
    cookiesPolicy: string;
    essentialOnly: string;
    acceptOptional: string;
    savePreferences: string;
    alwaysOn: string;
    closeDialog: string;
    mainNavigation: string;
    privacyPreferences: string;
    saved: string;
    conditionsTitle: string;
    pricingLink: string;
    latency: string;
    spreads: string;
    variablePricing: string;
    baseCommission: string;
    optionalMarkup: string;
    executionModel: string;
    directRouting: string;
    conditionsNote: string;
  }
> = {
  en: {
    changeLanguage: "Change language",
    navigation: [
      "Solutions",
      "A-book liquidity",
      "Trading platforms",
      "Copy trading",
      "MT5 deposits",
      "Resources",
    ],
    closeNavigation: "Close navigation",
    openNavigation: "Open navigation",
    eyebrow: "YOUR BRAND. YOUR BROKERAGE.",
    headingOne: "Launch your own brokerage",
    headingTwo: "or prop firm.",
    headingThree: "Built to power your trading business.",
    heroDescription:
      "Your brand. Your clients. Our infrastructure. Launch with Azuriya’s trading platform or connect MT5 and manage your entire operation from one place.",
    explorePortal: "Start Your Brokerage",
    seeCompleteSolution: "Launch a Prop Firm",
    mt5Deposit: "Deposit directly from MT5 · Desktop & mobile",
    welcomeTitle: "Make Azuriya yours",
    welcomeDescription:
      "Choose a language and set your cookie preferences before you explore.",
    languageLabel: "Language",
    suggestedLanguage: "Suggested for your region",
    cookiesTitle: "Cookie choices",
    cookiesDescription:
      "We use essential storage for secure sign-in, your language and preferences. You can choose whether to allow optional cookies.",
    essentialCookies: "Essential cookies",
    essentialDescription:
      "Required for secure sign-in and basic site preferences. Always on.",
    optionalCookies: "Optional cookies",
    optionalDescription:
      "Optional analytics and advertising. None are active in this preview.",
    cookiesPolicy: "Read our cookies and storage notice",
    essentialOnly: "Essential only",
    acceptOptional: "Accept optional cookies",
    savePreferences: "Save language & preferences",
    alwaysOn: "Always on",
    closeDialog: "Close",
    mainNavigation: "Main navigation",
    privacyPreferences: "Language & privacy",
    saved: "Your preferences have been saved.",
    conditionsTitle: "Execution built for serious brokerages.",
    pricingLink: "Explore pricing",
    latency: "Target execution",
    spreads: "Spreads from",
    variablePricing: "Variable liquidity provider pricing",
    baseCommission: "Base commission",
    optionalMarkup: "Optional markup up to $5.00 / lot",
    executionModel: "Execution model",
    directRouting: "Direct liquidity provider routing",
    conditionsNote:
      "0.00 pips is a starting spread, not a fixed rate. 0.05 seconds is a target, not a measured guarantee. Instrument, market conditions, network, liquidity route and account terms affect results. Local preview execution is simulated.",
  },
  pt: {
    changeLanguage: "Alterar idioma",
    navigation: [
      "Soluções",
      "Liquidez A-book",
      "Plataformas de trading",
      "Copy trading",
      "Depósitos MT5",
      "Recursos",
    ],
    closeNavigation: "Fechar navegação",
    openNavigation: "Abrir navegação",
    eyebrow: "A SUA COMUNIDADE. A SUA CORRETORA.",
    headingOne: "Soluções gratuitas de",
    headingTwo: "corretagem e prop firm.",
    headingThree: "Criada para impulsionar seu negócio de trading.",
    heroDescription:
      "Transforme a sua comunidade num negócio de trading completo. Reúna plataformas, contas, copy trading, pagamentos e toda a equipa num único portal.",
    explorePortal: "Explore o seu portal",
    seeCompleteSolution: "Conheça a solução completa",
    mt5Deposit: "Deposite diretamente pelo MT5 · computador e telemóvel",
    welcomeTitle: "Personalize a Azuriya",
    welcomeDescription:
      "Escolha um idioma e defina as suas preferências de cookies antes de explorar.",
    languageLabel: "Idioma",
    suggestedLanguage: "Sugerido para a sua região",
    cookiesTitle: "Preferências de cookies",
    cookiesDescription:
      "Usamos armazenamento essencial para iniciar sessão com segurança e guardar o idioma e as preferências. Pode optar por permitir cookies opcionais.",
    essentialCookies: "Cookies essenciais",
    essentialDescription:
      "Necessários para iniciar sessão com segurança e guardar preferências básicas. Sempre ativos.",
    optionalCookies: "Cookies opcionais",
    optionalDescription:
      "Análise e publicidade opcionais. Nenhum está ativo nesta pré-visualização.",
    cookiesPolicy: "Consulte o aviso sobre cookies e armazenamento",
    essentialOnly: "Apenas essenciais",
    acceptOptional: "Aceitar cookies opcionais",
    savePreferences: "Guardar idioma e preferências",
    alwaysOn: "Sempre ativos",
    closeDialog: "Fechar",
    mainNavigation: "Navegação principal",
    privacyPreferences: "Idioma e privacidade",
    saved: "As suas preferências foram guardadas.",
    conditionsTitle: "Condições de trading em resumo.",
    pricingLink: "Ver preços",
    latency: "Latência de execução",
    spreads: "Spreads a partir de",
    variablePricing: "Preços variáveis dos provedores de liquidez",
    baseCommission: "Comissão base",
    optionalMarkup: "Markup opcional até $5,00 / lote",
    executionModel: "Modelo de execução",
    directRouting: "Roteamento direto para provedores de liquidez",
    conditionsNote:
      "As condições variam conforme o instrumento, a conta e a rota de liquidez. A comissão é apresentada antes do markup opcional; a base de cobrança segue os termos da conta. A execução nesta pré-visualização local é simulada.",
  },
  es: {
    changeLanguage: "Cambiar idioma",
    navigation: [
      "Soluciones",
      "Liquidez A-book",
      "Plataformas de trading",
      "Copy trading",
      "Depósitos MT5",
      "Recursos",
    ],
    closeNavigation: "Cerrar navegación",
    openNavigation: "Abrir navegación",
    eyebrow: "TU COMUNIDAD. TU CORREDURÍA.",
    headingOne: "Soluciones gratuitas de",
    headingTwo: "brokerage y prop firm.",
    headingThree: "Creada para impulsar tu negocio de trading.",
    heroDescription:
      "Convierte tu comunidad en un negocio de trading completo. Reúne plataformas, cuentas, copy trading, pagos y a todo tu equipo en un solo portal.",
    explorePortal: "Explora tu portal",
    seeCompleteSolution: "Descubre la solución completa",
    mt5Deposit: "Deposita directamente desde MT5 · ordenador y móvil",
    welcomeTitle: "Haz Azuriya a tu medida",
    welcomeDescription:
      "Elige un idioma y configura tus preferencias de cookies antes de explorar.",
    languageLabel: "Idioma",
    suggestedLanguage: "Sugerido para tu región",
    cookiesTitle: "Preferencias de cookies",
    cookiesDescription:
      "Usamos almacenamiento esencial para iniciar sesión de forma segura y guardar el idioma y tus preferencias. Puedes permitir cookies opcionales.",
    essentialCookies: "Cookies esenciales",
    essentialDescription:
      "Necesarias para iniciar sesión de forma segura y guardar preferencias básicas. Siempre activas.",
    optionalCookies: "Cookies opcionales",
    optionalDescription:
      "Analítica y publicidad opcionales. No hay ninguna activa en esta vista previa.",
    cookiesPolicy: "Lee el aviso sobre cookies y almacenamiento",
    essentialOnly: "Solo esenciales",
    acceptOptional: "Aceptar cookies opcionales",
    savePreferences: "Guardar idioma y preferencias",
    alwaysOn: "Siempre activas",
    closeDialog: "Cerrar",
    mainNavigation: "Navegación principal",
    privacyPreferences: "Idioma y privacidad",
    saved: "Se han guardado tus preferencias.",
    conditionsTitle: "Condiciones de trading de un vistazo.",
    pricingLink: "Ver precios",
    latency: "Latencia de ejecución",
    spreads: "Spreads desde",
    variablePricing: "Precios variables del proveedor de liquidez",
    baseCommission: "Comisión base",
    optionalMarkup: "Markup opcional hasta $5,00 / lote",
    executionModel: "Modelo de ejecución",
    directRouting: "Enrutamiento directo a proveedores de liquidez",
    conditionsNote:
      "Las condiciones varían según el instrumento, la cuenta y la ruta de liquidez. La comisión se muestra antes del markup opcional; el cálculo depende de las condiciones de la cuenta. La ejecución de la vista previa local es simulada.",
  },
  hi: {
    changeLanguage: "भाषा बदलें",
    navigation: [
      "समाधान",
      "A-book लिक्विडिटी",
      "ट्रेडिंग प्लेटफ़ॉर्म",
      "कॉपी ट्रेडिंग",
      "MT5 जमा",
      "संसाधन",
    ],
    closeNavigation: "नेविगेशन बंद करें",
    openNavigation: "नेविगेशन खोलें",
    eyebrow: "आपका समुदाय। आपकी ब्रोकरेज।",
    headingOne: "मुफ़्त ब्रोकरेज और",
    headingTwo: "प्रॉप फ़र्म समाधान।",
    headingThree: "आपके ट्रेडिंग व्यवसाय को आगे बढ़ाने के लिए।",
    heroDescription:
      "अपने समुदाय को एक संपूर्ण ट्रेडिंग व्यवसाय में बदलें। प्लेटफ़ॉर्म, खाते, कॉपी ट्रेडिंग, भुगतान और पूरी टीम को एक पोर्टल में लाएँ।",
    explorePortal: "अपना पोर्टल देखें",
    seeCompleteSolution: "पूरा समाधान देखें",
    mt5Deposit: "MT5 से सीधे जमा करें · डेस्कटॉप और मोबाइल",
    welcomeTitle: "Azuriya को अपने अनुसार बनाएँ",
    welcomeDescription:
      "आगे बढ़ने से पहले भाषा चुनें और कुकी प्राथमिकताएँ तय करें।",
    languageLabel: "भाषा",
    suggestedLanguage: "आपके क्षेत्र के लिए सुझाई गई",
    cookiesTitle: "कुकी विकल्प",
    cookiesDescription:
      "सुरक्षित साइन-इन, भाषा और प्राथमिकताओं के लिए आवश्यक स्टोरेज का उपयोग होता है। आप वैकल्पिक कुकीज़ चुन सकते हैं।",
    essentialCookies: "ज़रूरी कुकीज़",
    essentialDescription:
      "सुरक्षित साइन-इन और बुनियादी प्राथमिकताओं के लिए आवश्यक। हमेशा चालू।",
    optionalCookies: "वैकल्पिक कुकीज़",
    optionalDescription:
      "वैकल्पिक विश्लेषण और विज्ञापन। इस पूर्वावलोकन में सक्रिय नहीं हैं।",
    cookiesPolicy: "कुकी और स्टोरेज सूचना पढ़ें",
    essentialOnly: "केवल ज़रूरी",
    acceptOptional: "वैकल्पिक कुकीज़ स्वीकारें",
    savePreferences: "भाषा और प्राथमिकताएँ सहेजें",
    alwaysOn: "हमेशा चालू",
    closeDialog: "बंद करें",
    mainNavigation: "मुख्य नेविगेशन",
    privacyPreferences: "भाषा और गोपनीयता",
    saved: "आपकी प्राथमिकताएँ सहेज दी गई हैं।",
    conditionsTitle: "ट्रेडिंग की शर्तें एक नज़र में।",
    pricingLink: "मूल्य देखें",
    latency: "एक्ज़ीक्यूशन लेटेंसी",
    spreads: "स्प्रेड शुरू",
    variablePricing: "लिक्विडिटी प्रदाता के परिवर्तनीय मूल्य",
    baseCommission: "आधार कमीशन",
    optionalMarkup: "$5.00 / लॉट तक वैकल्पिक मार्कअप",
    executionModel: "एक्ज़ीक्यूशन मॉडल",
    directRouting: "लिक्विडिटी प्रदाता को सीधी रूटिंग",
    conditionsNote:
      "शर्तें इंस्ट्रूमेंट, खाते और लिक्विडिटी रूट के अनुसार बदलती हैं। वैकल्पिक मार्कअप से पहले कमीशन दिखाया जाता है; शुल्क का आधार आपके खाते की शर्तों पर निर्भर है। इस स्थानीय प्रीव्यू में एक्ज़ीक्यूशन सिम्युलेटेड है।",
  },
  ar: {
    changeLanguage: "تغيير اللغة",
    navigation: [
      "الحلول",
      "سيولة A-book",
      "منصات التداول",
      "نسخ التداول",
      "إيداع MT5",
      "الموارد",
    ],
    closeNavigation: "إغلاق التنقل",
    openNavigation: "فتح التنقل",
    eyebrow: "مجتمعك. وساطتك.",
    headingOne: "حلول وساطة مجانية و",
    headingTwo: "شركات تداول ممولة.",
    headingThree: "مصممة لدعم أعمالك في التداول.",
    heroDescription:
      "حوّل مجتمعك إلى أعمال تداول متكاملة. اجمع المنصات والحسابات ونسخ التداول والمدفوعات وفريقك بالكامل في بوابة واحدة.",
    explorePortal: "استكشف بوابتك",
    seeCompleteSolution: "اكتشف الحل الكامل",
    mt5Deposit: "أودع مباشرة من MT5 · الكمبيوتر والهاتف",
    welcomeTitle: "خصّص Azuriya لك",
    welcomeDescription:
      "اختر اللغة واضبط تفضيلات ملفات تعريف الارتباط قبل المتابعة.",
    languageLabel: "اللغة",
    suggestedLanguage: "مقترحة لمنطقتك",
    cookiesTitle: "خيارات ملفات تعريف الارتباط",
    cookiesDescription:
      "نستخدم التخزين الضروري لتسجيل الدخول بأمان وحفظ اللغة والتفضيلات. يمكنك السماح بملفات تعريف الارتباط الاختيارية.",
    essentialCookies: "ملفات تعريف الارتباط الضرورية",
    essentialDescription:
      "مطلوبة لتسجيل الدخول الآمن والتفضيلات الأساسية. مفعّلة دائمًا.",
    optionalCookies: "ملفات تعريف الارتباط الاختيارية",
    optionalDescription:
      "للتحليلات والإعلانات الاختيارية. لا شيء منها نشط في هذه المعاينة.",
    cookiesPolicy: "اقرأ إشعار ملفات تعريف الارتباط والتخزين",
    essentialOnly: "الضرورية فقط",
    acceptOptional: "قبول ملفات الارتباط الاختيارية",
    savePreferences: "حفظ اللغة والتفضيلات",
    alwaysOn: "مفعّلة دائمًا",
    closeDialog: "إغلاق",
    mainNavigation: "التنقل الرئيسي",
    privacyPreferences: "اللغة والخصوصية",
    saved: "تم حفظ تفضيلاتك.",
    conditionsTitle: "شروط التداول في لمحة.",
    pricingLink: "استكشف الأسعار",
    latency: "زمن تنفيذ الأوامر",
    spreads: "فروق الأسعار تبدأ من",
    variablePricing: "أسعار متغيرة من مزودي السيولة",
    baseCommission: "العمولة الأساسية",
    optionalMarkup: "زيادة اختيارية حتى $5.00 لكل لوت",
    executionModel: "نموذج التنفيذ",
    directRouting: "توجيه مباشر إلى مزودي السيولة",
    conditionsNote:
      "تختلف الشروط حسب الأداة والحساب ومسار السيولة. تُعرض العمولة قبل الزيادة الاختيارية، ويعتمد أساس الرسوم على شروط حسابك. التنفيذ في المعاينة المحلية محاكاة.",
  },
  bn: {
    changeLanguage: "ভাষা পরিবর্তন করুন",
    navigation: [
      "সমাধান",
      "A-book লিকুইডিটি",
      "ট্রেডিং প্ল্যাটফর্ম",
      "কপি ট্রেডিং",
      "MT5 জমা",
      "রিসোর্স",
    ],
    closeNavigation: "নেভিগেশন বন্ধ করুন",
    openNavigation: "নেভিগেশন খুলুন",
    eyebrow: "আপনার কমিউনিটি। আপনার ব্রোকারেজ।",
    headingOne: "বিনামূল্যের ব্রোকারেজ ও",
    headingTwo: "প্রপ ফার্ম সমাধান।",
    headingThree: "আপনার ট্রেডিং ব্যবসাকে এগিয়ে নিতে তৈরি।",
    heroDescription:
      "আপনার কমিউনিটিকে পূর্ণাঙ্গ ট্রেডিং ব্যবসায় রূপ দিন। প্ল্যাটফর্ম, অ্যাকাউন্ট, কপি ট্রেডিং, পেমেন্ট ও পুরো দলকে এক পোর্টালে আনুন।",
    explorePortal: "আপনার পোর্টাল দেখুন",
    seeCompleteSolution: "সম্পূর্ণ সমাধান দেখুন",
    mt5Deposit: "MT5 থেকে সরাসরি জমা · ডেস্কটপ ও মোবাইল",
    welcomeTitle: "Azuriya আপনার মতো করে সাজান",
    welcomeDescription: "অন্বেষণের আগে ভাষা নির্বাচন ও কুকি পছন্দ ঠিক করুন।",
    languageLabel: "ভাষা",
    suggestedLanguage: "আপনার অঞ্চলের জন্য প্রস্তাবিত",
    cookiesTitle: "কুকি পছন্দ",
    cookiesDescription:
      "নিরাপদ সাইন-ইন, ভাষা ও পছন্দ মনে রাখতে প্রয়োজনীয় স্টোরেজ ব্যবহার করি। ঐচ্ছিক কুকি অনুমতি দিতে পারেন।",
    essentialCookies: "প্রয়োজনীয় কুকি",
    essentialDescription:
      "নিরাপদ সাইন-ইন ও মৌলিক পছন্দের জন্য প্রয়োজনীয়। সবসময় চালু।",
    optionalCookies: "ঐচ্ছিক কুকি",
    optionalDescription:
      "ঐচ্ছিক অ্যানালিটিক্স ও বিজ্ঞাপন। এই প্রিভিউতে সক্রিয় নয়।",
    cookiesPolicy: "কুকি ও স্টোরেজ নোটিশ পড়ুন",
    essentialOnly: "শুধু প্রয়োজনীয়",
    acceptOptional: "ঐচ্ছিক কুকি গ্রহণ করুন",
    savePreferences: "ভাষা ও পছন্দ সংরক্ষণ করুন",
    alwaysOn: "সবসময় চালু",
    closeDialog: "বন্ধ করুন",
    mainNavigation: "প্রধান নেভিগেশন",
    privacyPreferences: "ভাষা ও গোপনীয়তা",
    saved: "আপনার পছন্দ সংরক্ষণ করা হয়েছে।",
    conditionsTitle: "এক নজরে ট্রেডিংয়ের শর্তাবলি।",
    pricingLink: "মূল্য দেখুন",
    latency: "এক্সিকিউশন লেটেন্সি",
    spreads: "স্প্রেড শুরু",
    variablePricing: "লিকুইডিটি প্রোভাইডারের পরিবর্তনশীল মূল্য",
    baseCommission: "বেস কমিশন",
    optionalMarkup: "প্রতি লটে $5.00 পর্যন্ত ঐচ্ছিক মার্কআপ",
    executionModel: "এক্সিকিউশন মডেল",
    directRouting: "লিকুইডিটি প্রোভাইডারে সরাসরি রাউটিং",
    conditionsNote:
      "ইনস্ট্রুমেন্ট, অ্যাকাউন্ট ও লিকুইডিটি রুট অনুযায়ী শর্ত বদলাতে পারে। ঐচ্ছিক মার্কআপের আগে কমিশন দেখানো হয়েছে; চার্জ অ্যাকাউন্টের শর্ত অনুযায়ী হবে। স্থানীয় প্রিভিউতে এক্সিকিউশন সিমুলেটেড।",
  },
  fr: {
    changeLanguage: "Changer de langue",
    navigation: [
      "Solutions",
      "Liquidité A-book",
      "Plateformes de trading",
      "Copy trading",
      "Dépôts MT5",
      "Ressources",
    ],
    closeNavigation: "Fermer la navigation",
    openNavigation: "Ouvrir la navigation",
    eyebrow: "VOTRE COMMUNAUTÉ. VOTRE COURTAGE.",
    headingOne: "Solutions de courtage",
    headingTwo: "et prop firm gratuites.",
    headingThree: "Conçue pour développer votre activité de trading.",
    heroDescription:
      "Faites de votre communauté une activité de trading complète. Réunissez plateformes, comptes, copy trading, paiements et toute votre équipe dans un seul portail.",
    explorePortal: "Explorer votre portail",
    seeCompleteSolution: "Découvrir la solution complète",
    mt5Deposit: "Déposez directement depuis MT5 · ordinateur et mobile",
    welcomeTitle: "Azuriya, à votre façon",
    welcomeDescription:
      "Choisissez une langue et vos préférences de cookies avant de découvrir le site.",
    languageLabel: "Langue",
    suggestedLanguage: "Suggestion pour votre région",
    cookiesTitle: "Choix des cookies",
    cookiesDescription:
      "Nous utilisons un stockage essentiel pour sécuriser la connexion et mémoriser la langue et vos préférences. Vous pouvez autoriser les cookies facultatifs.",
    essentialCookies: "Cookies essentiels",
    essentialDescription:
      "Nécessaires à la connexion sécurisée et aux préférences de base. Toujours actifs.",
    optionalCookies: "Cookies facultatifs",
    optionalDescription:
      "Mesure d’audience et publicité facultatives. Aucun n’est actif dans cet aperçu.",
    cookiesPolicy: "Lire notre notice sur les cookies et le stockage",
    essentialOnly: "Essentiels uniquement",
    acceptOptional: "Accepter les cookies facultatifs",
    savePreferences: "Enregistrer la langue et les préférences",
    alwaysOn: "Toujours activés",
    closeDialog: "Fermer",
    mainNavigation: "Navigation principale",
    privacyPreferences: "Langue et confidentialité",
    saved: "Vos préférences ont été enregistrées.",
    conditionsTitle: "Les conditions de trading en un coup d’œil.",
    pricingLink: "Voir les tarifs",
    latency: "Latence d’exécution",
    spreads: "Spreads à partir de",
    variablePricing: "Tarification variable des fournisseurs de liquidité",
    baseCommission: "Commission de base",
    optionalMarkup: "Majoration facultative jusqu’à 5,00 $ / lot",
    executionModel: "Modèle d’exécution",
    directRouting: "Routage direct vers les fournisseurs de liquidité",
    conditionsNote:
      "Les conditions varient selon l’instrument, le compte et la route de liquidité. La commission est indiquée avant toute majoration facultative ; la base de facturation dépend des conditions de votre compte. L’exécution de l’aperçu local est simulée.",
  },
  ru: {
    changeLanguage: "Изменить язык",
    navigation: [
      "Решения",
      "Ликвидность A-book",
      "Торговые платформы",
      "Копирование сделок",
      "Пополнение MT5",
      "Материалы",
    ],
    closeNavigation: "Закрыть навигацию",
    openNavigation: "Открыть навигацию",
    eyebrow: "ВАШЕ СООБЩЕСТВО. ВАША БРОКЕРСКАЯ ПЛАТФОРМА.",
    headingOne: "Бесплатные брокерские",
    headingTwo: "решения и проп-компания.",
    headingThree: "Создана для развития вашего торгового бизнеса.",
    heroDescription:
      "Создайте полноценный торговый бизнес для своего сообщества. Объедините платформы, счета, копирование сделок, платежи и команду в одном портале.",
    explorePortal: "Открыть портал",
    seeCompleteSolution: "Посмотреть все возможности",
    mt5Deposit: "Пополнение напрямую из MT5 · компьютер и телефон",
    welcomeTitle: "Настройте Azuriya под себя",
    welcomeDescription:
      "Выберите язык и настройки файлов cookie, чтобы продолжить.",
    languageLabel: "Язык",
    suggestedLanguage: "Рекомендовано для вашего региона",
    cookiesTitle: "Настройки файлов cookie",
    cookiesDescription:
      "Мы используем необходимые данные для безопасного входа и сохранения языка и настроек. Вы можете разрешить необязательные cookie.",
    essentialCookies: "Обязательные cookie",
    essentialDescription:
      "Нужны для безопасного входа и базовых настроек. Всегда включены.",
    optionalCookies: "Необязательные cookie",
    optionalDescription:
      "Необязательная аналитика и реклама. В этой версии они не используются.",
    cookiesPolicy: "Правила использования cookie и хранилища",
    essentialOnly: "Только обязательные",
    acceptOptional: "Разрешить необязательные cookie",
    savePreferences: "Сохранить язык и настройки",
    alwaysOn: "Всегда включены",
    closeDialog: "Закрыть",
    mainNavigation: "Главная навигация",
    privacyPreferences: "Язык и конфиденциальность",
    saved: "Настройки сохранены.",
    conditionsTitle: "Торговые условия вкратце.",
    pricingLink: "Условия торговли",
    latency: "Задержка исполнения",
    spreads: "Спреды от",
    variablePricing: "Переменные цены поставщиков ликвидности",
    baseCommission: "Базовая комиссия",
    optionalMarkup: "Дополнительная наценка до $5,00 за лот",
    executionModel: "Модель исполнения",
    directRouting: "Прямая маршрутизация к поставщикам ликвидности",
    conditionsNote:
      "Условия зависят от инструмента, счёта и маршрута ликвидности. Комиссия указана без дополнительной наценки; порядок расчёта определяется условиями счёта. Исполнение в локальной версии является симуляцией.",
  },
  ur: {
    changeLanguage: "زبان تبدیل کریں",
    navigation: [
      "حل",
      "A-book لیکویڈیٹی",
      "ٹریڈنگ پلیٹ فارمز",
      "کاپی ٹریڈنگ",
      "MT5 ڈپازٹس",
      "وسائل",
    ],
    closeNavigation: "نیویگیشن بند کریں",
    openNavigation: "نیویگیشن کھولیں",
    eyebrow: "آپ کی کمیونٹی۔ آپ کی بروکریج۔",
    headingOne: "مفت بروکریج اور",
    headingTwo: "پراپ فرم کے حل۔",
    headingThree: "آپ کے ٹریڈنگ کاروبار کو آگے بڑھانے کے لیے۔",
    heroDescription:
      "اپنی کمیونٹی کو مکمل ٹریڈنگ کاروبار میں بدلیں۔ پلیٹ فارمز، اکاؤنٹس، کاپی ٹریڈنگ، ادائیگیاں اور پوری ٹیم ایک پورٹل میں لائیں۔",
    explorePortal: "اپنا پورٹل دیکھیں",
    seeCompleteSolution: "مکمل حل دیکھیں",
    mt5Deposit: "MT5 سے براہِ راست ڈپازٹ · ڈیسک ٹاپ اور موبائل",
    welcomeTitle: "Azuriya کو اپنی ضرورت کے مطابق بنائیں",
    welcomeDescription: "آگے بڑھنے سے پہلے زبان اور کوکی ترجیحات منتخب کریں۔",
    languageLabel: "زبان",
    suggestedLanguage: "آپ کے علاقے کے لیے تجویز کردہ",
    cookiesTitle: "کوکی کے انتخاب",
    cookiesDescription:
      "محفوظ سائن ان، زبان اور ترجیحات کے لیے ضروری اسٹوریج استعمال ہوتی ہے۔ آپ اختیاری کوکیز کی اجازت دے سکتے ہیں۔",
    essentialCookies: "ضروری کوکیز",
    essentialDescription:
      "محفوظ سائن ان اور بنیادی ترجیحات کے لیے ضروری۔ ہمیشہ فعال۔",
    optionalCookies: "اختیاری کوکیز",
    optionalDescription:
      "اختیاری تجزیات اور اشتہارات۔ اس پیش نظارہ میں کوئی فعال نہیں۔",
    cookiesPolicy: "کوکیز اور اسٹوریج کا نوٹس پڑھیں",
    essentialOnly: "صرف ضروری",
    acceptOptional: "اختیاری کوکیز قبول کریں",
    savePreferences: "زبان اور ترجیحات محفوظ کریں",
    alwaysOn: "ہمیشہ فعال",
    closeDialog: "بند کریں",
    mainNavigation: "مرکزی نیویگیشن",
    privacyPreferences: "زبان اور رازداری",
    saved: "آپ کی ترجیحات محفوظ کر دی گئی ہیں۔",
    conditionsTitle: "ٹریڈنگ کی شرائط ایک نظر میں۔",
    pricingLink: "قیمتیں دیکھیں",
    latency: "ایگزیکیوشن لیٹنسی",
    spreads: "اسپریڈ شروع",
    variablePricing: "لیکویڈیٹی فراہم کنندگان کی متغیر قیمتیں",
    baseCommission: "بنیادی کمیشن",
    optionalMarkup: "فی لاٹ $5.00 تک اختیاری مارک اپ",
    executionModel: "ایگزیکیوشن ماڈل",
    directRouting: "لیکویڈیٹی فراہم کنندگان کو براہِ راست روٹنگ",
    conditionsNote:
      "شرائط انسٹرومنٹ، اکاؤنٹ اور لیکویڈیٹی روٹ کے مطابق بدلتی ہیں۔ اختیاری مارک اپ سے پہلے کمیشن دکھایا گیا ہے؛ چارجز کی بنیاد اکاؤنٹ کی شرائط کے مطابق ہوگی۔ مقامی پیش نظارہ میں ایگزیکیوشن simulated ہے۔",
  },
  zh: {
    changeLanguage: "更改语言",
    navigation: [
      "解决方案",
      "A-book 流动性",
      "交易平台",
      "跟单交易",
      "MT5 入金",
      "资源",
    ],
    closeNavigation: "关闭导航",
    openNavigation: "打开导航",
    eyebrow: "您的社区，您的经纪业务。",
    headingOne: "免费经纪业务与",
    headingTwo: "自营交易公司解决方案。",
    headingThree: "为您的交易业务提供强大支持。",
    heroDescription:
      "将您的社区发展为完整的交易业务。通过一个门户整合平台、账户、跟单交易、支付和整个团队。",
    explorePortal: "探索您的门户",
    seeCompleteSolution: "了解完整方案",
    mt5Deposit: "直接从 MT5 入金 · 桌面端和移动端",
    welcomeTitle: "按您的方式使用 Azuriya",
    welcomeDescription: "探索前，请选择语言并设置 Cookie 偏好。",
    languageLabel: "语言",
    suggestedLanguage: "根据您所在地区推荐",
    cookiesTitle: "Cookie 选项",
    cookiesDescription:
      "我们使用必要存储来保障安全登录并保存语言和偏好设置。您可以选择允许可选 Cookie。",
    essentialCookies: "必要 Cookie",
    essentialDescription: "安全登录和基本偏好设置所必需。始终启用。",
    optionalCookies: "可选 Cookie",
    optionalDescription: "可选分析和广告 Cookie。本预览中均未启用。",
    cookiesPolicy: "阅读 Cookie 和存储说明",
    essentialOnly: "仅允许必要项",
    acceptOptional: "接受可选 Cookie",
    savePreferences: "保存语言和偏好设置",
    alwaysOn: "始终启用",
    closeDialog: "关闭",
    mainNavigation: "主导航",
    privacyPreferences: "语言与隐私",
    saved: "您的偏好设置已保存。",
    conditionsTitle: "交易条件一览。",
    pricingLink: "查看价格",
    latency: "执行延迟",
    spreads: "点差低至",
    variablePricing: "流动性提供商浮动报价",
    baseCommission: "基础佣金",
    optionalMarkup: "每手最高 $5.00 的可选加价",
    executionModel: "执行模式",
    directRouting: "直连流动性提供商路由",
    conditionsNote:
      "具体条件因交易品种、账户和流动性路由而异。显示的佣金不含可选加价；收费方式以账户条款为准。本地预览中的执行为模拟交易。",
  },
};

export function isSiteLanguage(
  value: string | null | undefined,
): value is SiteLanguage {
  return !!value && siteLanguages.some((language) => language.code === value);
}

const countryLanguages: Record<string, SiteLanguage> = {
  BR: "pt",
  PT: "pt",
  AO: "pt",
  MZ: "pt",
  ES: "es",
  MX: "es",
  AR: "es",
  CO: "es",
  CL: "es",
  PE: "es",
  VE: "es",
  EC: "es",
  UY: "es",
  BO: "es",
  PY: "es",
  CR: "es",
  PA: "es",
  DO: "es",
  GT: "es",
  HN: "es",
  SV: "es",
  NI: "es",
  CU: "es",
  IN: "hi",
  BD: "bn",
  PK: "ur",
  SA: "ar",
  AE: "ar",
  EG: "ar",
  QA: "ar",
  KW: "ar",
  BH: "ar",
  OM: "ar",
  JO: "ar",
  LB: "ar",
  IQ: "ar",
  MA: "ar",
  DZ: "ar",
  TN: "ar",
  LY: "ar",
  SD: "ar",
  YE: "ar",
  FR: "fr",
  SN: "fr",
  CI: "fr",
  CD: "fr",
  CM: "fr",
  MG: "fr",
  NE: "fr",
  BF: "fr",
  ML: "fr",
  TG: "fr",
  BJ: "fr",
  GA: "fr",
  CG: "fr",
  GN: "fr",
  RW: "fr",
  RU: "ru",
  BY: "ru",
  KZ: "ru",
  KG: "ru",
  CN: "zh",
  TW: "zh",
  HK: "zh",
  SG: "zh",
};

export function siteLanguageFromHints(
  country: string | null | undefined,
  acceptLanguage: string | null | undefined,
): { locale: SiteLanguage; source: "country" | "browser" | "default" } {
  const byCountry = country
    ? countryLanguages[country.toUpperCase()]
    : undefined;
  if (byCountry) return { locale: byCountry, source: "country" };

  const browserCandidate = (acceptLanguage ?? "")
    .split(",")
    .map((entry) => entry.trim().split(";")[0]?.split("-")[0]?.toLowerCase())
    .find(isSiteLanguage);
  if (browserCandidate) return { locale: browserCandidate, source: "browser" };
  return { locale: "en", source: "default" };
}
