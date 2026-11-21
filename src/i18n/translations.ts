export type SupportedLanguage = 'en' | 'hi';

export interface TranslationDictionary {
  appName: string;
  tagline: string;
  nav: {
    home: string;
    explore: string;
    map: string;
    myReports: string;
    profile: string;
    planner: string;
    suggestOffice: string;
    admin: string;
    signIn: string;
    reportQueue: string;
  };
  common: {
    search: string;
    loading: string;
    retry: string;
    cancel: string;
    submit: string;
    save: string;
    close: string;
    allCategories: string;
    radius: string;
    directions: string;
    openInOsm: string;
    openInGoogleMaps: string;
    viewDetails: string;
    noData: string;
    signInRequired: string;
    osmSource: string;
    citizenSource: string;
    officialSource: string;
    disclaimerEstimate: string;
    osmAttribution: string;
    coverageHonesty: string;
    cachedDataNotice: string;
  };
  landing: {
    eyebrow: string;
    heroTitle: string;
    heroSubtitle: string;
    ctaExplore: string;
    ctaReport: string;
    howItWorksTitle: string;
    step1Title: string;
    step1Desc: string;
    step2Title: string;
    step2Desc: string;
    step3Title: string;
    step3Desc: string;
    principlesTitle: string;
    principle1Title: string;
    principle1Desc: string;
    principle2Title: string;
    principle2Desc: string;
    principle3Title: string;
    principle3Desc: string;
  };
  location: {
    searchPlaceholder: string;
    useCurrentLocation: string;
    detectingLocation: string;
    selectState: string;
    selectCity: string;
    searchArea: string;
    locationPermissionDenied: string;
    noLocationSelected: string;
    selectedArea: string;
  };
  dashboard: {
    title: string;
    subtitle: string;
    nearbyHeading: string;
    recentlyReportedHeading: string;
    noNearbyYet: string;
    noRecentReports: string;
    quickReportCta: string;
    categoriesHeading: string;
  };
  office: {
    currentCrowdStatus: string;
    estimatedWait: string;
    recentReports: string;
    noRecentReports: string;
    historicalTrends: string;
    insufficientHistory: string;
    bestTimeToVisit: string;
    busiestWeekdays: string;
    busiestPeriods: string;
    quietestPeriods: string;
    historicalAvgWait: string;
    observationsLabel: string;
    reportQueueBtn: string;
    flagReport: string;
    flagReasonPlaceholder: string;
    lastUpdated: string;
    officialContact: string;
    website: string;
    phone: string;
    notListed: string;
    aiPrepTitle: string;
    aiPrepButton: string;
    aiPrepLoading: string;
  };
  reportForm: {
    title: string;
    subtitle: string;
    selectOffice: string;
    searchOfficePlaceholder: string;
    queueSizeLabel: string;
    waitingTimeLabel: string;
    crowdLevelLabel: string;
    noteLabel: string;
    notePlaceholder: string;
    confirmCheckbox: string;
    submitButton: string;
    submitting: string;
    successTitle: string;
    successDesc: string;
    validationSelectOffice: string;
    validationConfirm: string;
  };
  planner: {
    title: string;
    subtitle: string;
    selectOffice: string;
    preferredDate: string;
    preferredTime: string;
    evaluateButton: string;
    disclaimer: string;
  };
  suggest: {
    title: string;
    subtitle: string;
    officeName: string;
    category: string;
    state: string;
    city: string;
    district: string;
    address: string;
    postalCode: string;
    latitude: string;
    longitude: string;
    websiteOptional: string;
    phoneOptional: string;
    pendingNotice: string;
    submitButton: string;
    successMessage: string;
  };
  auth: {
    title: string;
    signUpTitle: string;
    subtitle: string;
    signInTab: string;
    signUpTab: string;
    emailLabel: string;
    emailPlaceholder: string;
    passwordLabel: string;
    passwordPlaceholder: string;
    confirmPasswordLabel: string;
    signInButton: string;
    signUpButton: string;
    passwordMismatch: string;
    passwordTooShort: string;
    signOut: string;
    displayName: string;
    preferredLanguage: string;
    memberSince: string;
    profileUpdated: string;
  };
  supabaseNotice: {
    title: string;
    description: string;
    envListLabel: string;
  };
}

export const translations: Record<SupportedLanguage, TranslationDictionary> = {
  en: {
    appName: 'PratikshaIQ',
    tagline: 'Know the Queue. Plan Your Visit.',
    nav: {
      home: 'Home',
      explore: 'Explore',
      map: 'Map',
      myReports: 'My Reports',
      profile: 'Profile',
      planner: 'Visit Planner',
      suggestOffice: 'Suggest Office',
      admin: 'Admin',
      signIn: 'Sign In',
      reportQueue: 'Report Queue',
    },
    common: {
      search: 'Search',
      loading: 'Loading...',
      retry: 'Try Again',
      cancel: 'Cancel',
      submit: 'Submit',
      save: 'Save Changes',
      close: 'Close',
      allCategories: 'All Categories',
      radius: 'Radius',
      directions: 'Directions',
      openInOsm: 'OpenStreetMap Directions',
      openInGoogleMaps: 'Google Maps Directions',
      viewDetails: 'View Office',
      noData: 'No data yet',
      signInRequired: 'Please sign in to continue.',
      osmSource: 'OpenStreetMap Mapped',
      citizenSource: 'Citizen-Submitted (Approved)',
      officialSource: 'Official Record',
      disclaimerEstimate:
        'Waiting times are citizen-reported or system-calculated estimates and are not guaranteed.',
      osmAttribution: 'Map & public office discovery powered by OpenStreetMap contributors.',
      coverageHonesty:
        'OpenStreetMap does not yet list every government office in India. If an office is missing, citizens can suggest it for review.',
      cachedDataNotice:
        'Showing previously retrieved OpenStreetMap records saved locally because external map servers are currently unavailable.',
    },
    landing: {
      eyebrow: 'Pan-India Civic Queue Intelligence',
      heroTitle: 'Know the queue before you visit a public office.',
      heroSubtitle:
        'Discover mapped government offices across all 28 Indian states and 8 union territories, check real citizen-submitted waiting times, and contribute live updates from your visit.',
      ctaExplore: 'Explore Nearby Offices',
      ctaReport: 'Submit a Queue Report',
      howItWorksTitle: 'How PratikshaIQ works',
      step1Title: '01. Discover real mapped offices',
      step1Desc:
        'Search any Indian city, district, locality, or 6-digit PIN code—or grant location access to load genuine OpenStreetMap public service centres nearby.',
      step2Title: '02. Check transparent crowd estimates',
      step2Desc:
        'View recency-weighted crowd conditions calculated strictly from recent citizen reports, with clear confidence levels and honest empty states when data is absent.',
      step3Title: '03. Contribute and plan visits',
      step3Desc:
        'Authenticated citizens log actual waiting times, helping build historical peak-hour patterns and suggest missing offices for administrative review.',
      principlesTitle: 'Built on data honesty',
      principle1Title: 'Zero fabricated statistics',
      principle1Desc:
        'If an office has no recent citizen reports, we tell you plainly instead of inventing a crowd level or fake wait time.',
      principle2Title: 'Recency-weighted intelligence',
      principle2Desc:
        'Reports within 15–30 minutes carry the highest weight; observations older than 2 hours expire automatically from live status.',
      principle3Title: 'Pan-India coverage, citizen-verified',
      principle3Desc:
        'Works across all 28 states and 8 union territories, clearly distinguishing OpenStreetMap records from approved citizen suggestions.',
    },
    location: {
      searchPlaceholder: 'Search city, district, locality, or 6-digit PIN code...',
      useCurrentLocation: 'Use Current Location',
      detectingLocation: 'Detecting location...',
      selectState: 'Select State / UT',
      selectCity: 'Select City',
      searchArea: 'Search This Area',
      locationPermissionDenied:
        'Location permission was not granted. You can search any Indian city, locality, or PIN code manually.',
      noLocationSelected:
        'Choose an Indian state and city, search by PIN code, or allow browser location access to discover nearby public offices.',
      selectedArea: 'Showing area around',
    },
    dashboard: {
      title: 'Civic Queue Dashboard',
      subtitle: 'Discover real public offices and live citizen-reported queue conditions across India.',
      nearbyHeading: 'Public offices in selected area',
      recentlyReportedHeading: 'Recently reported offices',
      noNearbyYet:
        'Select a location above or grant location permission to discover nearby government offices from OpenStreetMap.',
      noRecentReports:
        'No citizen queue reports have been submitted yet in the database. Be the first to report an office visit.',
      quickReportCta: 'Report Current Queue',
      categoriesHeading: 'Filter by public service category',
    },
    office: {
      currentCrowdStatus: 'Current crowd status',
      estimatedWait: 'Waiting time summary',
      recentReports: 'Recent citizen reports',
      noRecentReports: 'No recent citizen reports recorded for this office yet. Be the first to report.',
      historicalTrends: 'Historical crowd patterns',
      insufficientHistory: 'Not enough historical data to identify peak hours yet.',
      bestTimeToVisit: 'Historically quieter periods',
      busiestWeekdays: 'Busiest weekdays',
      busiestPeriods: 'Busiest time periods',
      quietestPeriods: 'Least crowded time periods',
      historicalAvgWait: 'Historical average waiting time',
      observationsLabel: 'Observations',
      reportQueueBtn: 'Report Queue Status',
      flagReport: 'Flag inaccurate',
      flagReasonPlaceholder: 'Explain why this report appears inaccurate...',
      lastUpdated: 'Last updated',
      officialContact: 'Contact & location details',
      website: 'Official website',
      phone: 'Phone',
      notListed: 'Not listed in source data',
      aiPrepTitle: 'Optional visit preparation checklist',
      aiPrepButton: 'Generate Preparation Checklist',
      aiPrepLoading: 'Preparing civic checklist...',
    },
    reportForm: {
      title: 'Submit real-time queue report',
      subtitle: 'Share your actual waiting experience to help fellow citizens plan their visit.',
      selectOffice: 'Selected public office',
      searchOfficePlaceholder: 'Search discovered or database offices...',
      queueSizeLabel: 'Current queue size',
      waitingTimeLabel: 'Estimated waiting time',
      crowdLevelLabel: 'Crowd level',
      noteLabel: 'Optional note',
      notePlaceholder: 'e.g. Token counter moving steadily, separate senior citizen line open...',
      confirmCheckbox:
        'I confirm that I am reporting my actual, firsthand experience at this public office.',
      submitButton: 'Submit Queue Report',
      submitting: 'Submitting report...',
      successTitle: 'Queue report submitted',
      successDesc:
        'Thank you. Your report has been saved and the office crowd status has been recalculated.',
      validationSelectOffice: 'Please select a public office before submitting a report.',
      validationConfirm: 'Please confirm that you are reporting your actual experience.',
    },
    planner: {
      title: 'Smart Visit Planner',
      subtitle:
        'Check historical crowd observations for your preferred date and time when sufficient data exists.',
      selectOffice: 'Select public office',
      preferredDate: 'Preferred visit date',
      preferredTime: 'Preferred arrival time',
      evaluateButton: 'Check Historical Patterns',
      disclaimer:
        'Recommendations reflect past citizen reports only and do not guarantee lower crowds on your chosen date.',
    },
    suggest: {
      title: 'Suggest a missing public office',
      subtitle:
        'OpenStreetMap does not cover every Indian government office. Submit details for administrator review.',
      officeName: 'Office name',
      category: 'Office category',
      state: 'State / Union Territory',
      city: 'City / Town / Village',
      district: 'District (optional)',
      address: 'Full street address',
      postalCode: '6-digit PIN code (optional)',
      latitude: 'Latitude',
      longitude: 'Longitude',
      websiteOptional: 'Official website (optional)',
      phoneOptional: 'Contact phone (optional)',
      pendingNotice:
        'Citizen-submitted offices remain marked as pending verification until reviewed and approved by an administrator.',
      submitButton: 'Submit for Review',
      successMessage:
        'Thank you! Your office suggestion has been submitted and is pending administrator review.',
    },
    auth: {
      title: 'Citizen Sign In',
      signUpTitle: 'Create Citizen Account',
      subtitle:
        'Sign in with your email and password to submit queue reports and suggest missing offices. Browsing public offices requires no login.',
      signInTab: 'Sign In',
      signUpTab: 'Create Account',
      emailLabel: 'Email address',
      emailPlaceholder: 'citizen@example.com',
      passwordLabel: 'Password',
      passwordPlaceholder: 'Enter your password',
      confirmPasswordLabel: 'Confirm password',
      signInButton: 'Sign In',
      signUpButton: 'Create Account',
      passwordMismatch: 'Passwords do not match.',
      passwordTooShort: 'Password must be at least 6 characters long.',
      signOut: 'Sign Out',
      displayName: 'Display name',
      preferredLanguage: 'Preferred language',
      memberSince: 'Account created',
      profileUpdated: 'Profile saved successfully.',
    },
    supabaseNotice: {
      title: 'Supabase configuration required for database & authentication',
      description:
        'Pan-India OpenStreetMap discovery and mapping are active right now. To enable real user authentication, queue report persistence, realtime updates, and admin moderation, configure your Supabase project credentials.',
      envListLabel: 'Required environment variables',
    },
  },
  hi: {
    appName: 'PratikshaIQ',
    tagline: 'कतार जानें। अपनी यात्रा की योजना बनाएं।',
    nav: {
      home: 'होम',
      explore: 'कार्यालय खोजें',
      map: 'नक्शा',
      myReports: 'मेरी रिपोर्ट',
      profile: 'प्रोफ़ाइल',
      planner: 'विज़िट प्लानर',
      suggestOffice: 'कार्यालय सुझाएं',
      admin: 'प्रशासन',
      signIn: 'साइन इन',
      reportQueue: 'कतार रिपोर्ट करें',
    },
    common: {
      search: 'खोजें',
      loading: 'लोड हो रहा है...',
      retry: 'पुनः प्रयास करें',
      cancel: 'रद्द करें',
      submit: 'जमा करें',
      save: 'सहेजें',
      close: 'बंद करें',
      allCategories: 'सभी श्रेणियां',
      radius: 'दायरा',
      directions: 'दिशा-निर्देश',
      openInOsm: 'OpenStreetMap दिशा-निर्देश',
      openInGoogleMaps: 'Google Maps दिशा-निर्देश',
      viewDetails: 'विवरण देखें',
      noData: 'अभी डेटा नहीं',
      signInRequired: 'आगे बढ़ने के लिए कृपया साइन इन करें।',
      osmSource: 'OpenStreetMap मानचित्रित',
      citizenSource: 'नागरिक सुझाव (स्वीकृत)',
      officialSource: 'आधिकारिक रिकॉर्ड',
      disclaimerEstimate:
        'प्रतीक्षा समय नागरिक रिपोर्ट या प्रणाली गणना पर आधारित अनुमान है और इसकी गारंटी नहीं है।',
      osmAttribution: 'मानचित्र और कार्यालय खोज OpenStreetMap योगदानकर्ताओं द्वारा संचालित है।',
      coverageHonesty:
        'OpenStreetMap में भारत के सभी सरकारी कार्यालय अभी सूचीबद्ध नहीं हैं। यदि कोई कार्यालय नहीं मिलता है, तो नागरिक उसे समीक्षा के लिए सुझा सकते हैं।',
      cachedDataNotice:
        'बाहरी मानचित्र सर्वर उपलब्ध न होने के कारण पहले से प्राप्त स्थानीय OpenStreetMap रिकॉर्ड दिखाए जा रहे हैं।',
    },
    landing: {
      eyebrow: 'अखिल भारतीय नागरिक कतार सूचना मंच',
      heroTitle: 'सरकारी कार्यालय जाने से पहले कतार की स्थिति जानें।',
      heroSubtitle:
        'भारत के सभी 28 राज्यों और 8 केंद्र शासित प्रदेशों में मानचित्रित सरकारी कार्यालय खोजें, वास्तविक नागरिक रिपोर्ट देखें और अपने अनुभव साझा करें।',
      ctaExplore: 'नज़दीकी कार्यालय खोजें',
      ctaReport: 'कतार रिपोर्ट जमा करें',
      howItWorksTitle: 'PratikshaIQ कैसे काम करता है',
      step1Title: '01. वास्तविक मानचित्रित कार्यालय खोजें',
      step1Desc:
        'किसी भी भारतीय शहर, जिले, इलाके या 6-अंकीय पिन कोड से खोजें, या अनुमति देकर अपने आसपास के OpenStreetMap कार्यालय देखें।',
      step2Title: '02. पारदर्शी भीड़ अनुमान देखें',
      step2Desc:
        'केवल हाल की वास्तविक नागरिक रिपोर्ट से गणना की गई भीड़ स्थिति और विश्वसनीयता स्तर देखें। डेटा न होने पर स्पष्ट संदेश दिखता है।',
      step3Title: '03. योगदान करें और योजना बनाएं',
      step3Desc:
        'लॉगिन किए गए नागरिक वास्तविक प्रतीक्षा समय रिपोर्ट कर सकते हैं और छूटे हुए कार्यालयों का सुझाव दे सकते हैं।',
      principlesTitle: 'ईमानदार डेटा सिद्धांत',
      principle1Title: 'कोई काल्पनिक आंकड़े नहीं',
      principle1Desc:
        'यदि किसी कार्यालय की हालिया रिपोर्ट नहीं है, तो कोई नकली भीड़ स्तर या प्रतीक्षा समय नहीं दिखाया जाता।',
      principle2Title: 'समय-आधारित सटीक गणना',
      principle2Desc:
        '15–30 मिनट की रिपोर्ट को सर्वाधिक महत्व मिलता है; 2 घंटे से पुरानी रिपोर्ट स्वतः लाइव स्थिति से हट जाती हैं।',
      principle3Title: 'संपूर्ण भारत कवरेज',
      principle3Desc:
        'सभी 28 राज्यों और 8 केंद्र शासित प्रदेशों में उपलब्ध, OpenStreetMap और स्वीकृत नागरिक सुझावों में स्पष्ट अंतर के साथ।',
    },
    location: {
      searchPlaceholder: 'शहर, जिला, क्षेत्र या 6-अंकीय पिन कोड खोजें...',
      useCurrentLocation: 'वर्तमान स्थान उपयोग करें',
      detectingLocation: 'स्थान प्राप्त किया जा रहा है...',
      selectState: 'राज्य / केंद्र शासित प्रदेश चुनें',
      selectCity: 'शहर चुनें',
      searchArea: 'इस क्षेत्र में खोजें',
      locationPermissionDenied:
        'स्थान की अनुमति नहीं मिली। आप किसी भी भारतीय शहर, क्षेत्र या पिन कोड को मैन्युअल रूप से खोज सकते हैं।',
      noLocationSelected:
        'नज़दीकी सरकारी कार्यालय खोजने के लिए राज्य व शहर चुनें, पिन कोड खोजें या स्थान अनुमति दें।',
      selectedArea: 'चयनित क्षेत्र',
    },
    dashboard: {
      title: 'नागरिक कतार डैशबोर्ड',
      subtitle: 'संपूर्ण भारत में वास्तविक सरकारी कार्यालय और नागरिक-रिपोर्टेड भीड़ स्थिति खोजें।',
      nearbyHeading: 'चयनित क्षेत्र के जन कार्यालय',
      recentlyReportedHeading: 'हाल ही में रिपोर्ट किए गए कार्यालय',
      noNearbyYet:
        'OpenStreetMap से नज़दीकी सरकारी कार्यालय खोजने के लिए ऊपर कोई स्थान चुनें या स्थान अनुमति दें।',
      noRecentReports:
        'डेटाबेस में अभी कोई नागरिक कतार रिपोर्ट जमा नहीं हुई है। पहली रिपोर्ट करने वाले बनें।',
      quickReportCta: 'वर्तमान कतार रिपोर्ट करें',
      categoriesHeading: 'कार्यालय श्रेणी के अनुसार फ़िल्टर करें',
    },
    office: {
      currentCrowdStatus: 'वर्तमान भीड़ स्थिति',
      estimatedWait: 'प्रतीक्षा समय सारांश',
      recentReports: 'हालिया नागरिक रिपोर्ट',
      noRecentReports: 'इस कार्यालय के लिए अभी कोई हालिया रिपोर्ट नहीं है। पहली रिपोर्ट करें।',
      historicalTrends: 'ऐतिहासिक भीड़ पैटर्न',
      insufficientHistory: 'पीक आवर्स की पहचान करने के लिए अभी पर्याप्त ऐतिहासिक डेटा उपलब्ध नहीं है।',
      bestTimeToVisit: 'ऐतिहासिक रूप से कम भीड़ वाले समय',
      busiestWeekdays: 'सबसे व्यस्त दिन',
      busiestPeriods: 'सबसे व्यस्त समय',
      quietestPeriods: 'सबसे कम भीड़ वाले समय',
      historicalAvgWait: 'ऐतिहासिक औसत प्रतीक्षा समय',
      observationsLabel: 'अवलोकन',
      reportQueueBtn: 'कतार स्थिति रिपोर्ट करें',
      flagReport: 'गलत रिपोर्ट चिह्नित करें',
      flagReasonPlaceholder: 'बताएं कि यह रिपोर्ट गलत क्यों प्रतीत होती है...',
      lastUpdated: 'अंतिम अपडेट',
      officialContact: 'संपर्क और स्थान विवरण',
      website: 'आधिकारिक वेबसाइट',
      phone: 'फ़ोन',
      notListed: 'स्रोत डेटा में उपलब्ध नहीं',
      aiPrepTitle: 'वैकल्पिक विज़िट तैयारी चेकलिस्ट',
      aiPrepButton: 'तैयारी चेकलिस्ट बनाएं',
      aiPrepLoading: 'चेकलिस्ट तैयार की जा रही है...',
    },
    reportForm: {
      title: 'रीयल-टाइम कतार रिपोर्ट जमा करें',
      subtitle: 'अन्य नागरिकों की मदद के लिए अपना वास्तविक प्रतीक्षा अनुभव साझा करें।',
      selectOffice: 'चयनित जन कार्यालय',
      searchOfficePlaceholder: 'खोजे गए या डेटाबेस कार्यालय ढूंढें...',
      queueSizeLabel: 'वर्तमान कतार का आकार',
      waitingTimeLabel: 'अनुमानित प्रतीक्षा समय',
      crowdLevelLabel: 'भीड़ का स्तर',
      noteLabel: 'वैकल्पिक टिप्पणी',
      notePlaceholder: 'जैसे: टोकन काउंटर तेज़ी से चल रहा है, वरिष्ठ नागरिक लाइन अलग है...',
      confirmCheckbox:
        'मैं पुष्टि करता/करती हूँ कि मैं इस कार्यालय में अपना वास्तविक अनुभव रिपोर्ट कर रहा/रही हूँ।',
      submitButton: 'कतार रिपोर्ट जमा करें',
      submitting: 'रिपोर्ट जमा की जा रही है...',
      successTitle: 'कतार रिपोर्ट सफलतापूर्वक जमा हुई',
      successDesc: 'धन्यवाद। आपकी रिपोर्ट सहेजी गई है और कार्यालय की भीड़ स्थिति अपडेट कर दी गई है।',
      validationSelectOffice: 'रिपोर्ट जमा करने से पहले कृपया एक जन कार्यालय चुनें।',
      validationConfirm: 'कृपया पुष्टि करें कि आप अपना वास्तविक अनुभव रिपोर्ट कर रहे हैं।',
    },
    planner: {
      title: 'स्मार्ट विज़िट प्लानर',
      subtitle: 'पर्याप्त ऐतिहासिक डेटा उपलब्ध होने पर अपनी चुनी तारीख और समय के लिए भीड़ पैटर्न देखें।',
      selectOffice: 'जन कार्यालय चुनें',
      preferredDate: 'पसंदीदा तारीख',
      preferredTime: 'पसंदीदा समय',
      evaluateButton: 'ऐतिहासिक पैटर्न जांचें',
      disclaimer:
        'सुझाव केवल पिछली नागरिक रिपोर्ट पर आधारित हैं और कम भीड़ की गारंटी नहीं देते।',
    },
    suggest: {
      title: 'छूटा हुआ जन कार्यालय सुझाएं',
      subtitle:
        'OpenStreetMap में भारत के सभी कार्यालय शामिल नहीं हैं। प्रशासनिक समीक्षा के लिए विवरण जमा करें।',
      officeName: 'कार्यालय का नाम',
      category: 'कार्यालय श्रेणी',
      state: 'राज्य / केंद्र शासित प्रदेश',
      city: 'शहर / कस्बा / ग्राम',
      district: 'जिला (वैकल्पिक)',
      address: 'पूरा पता',
      postalCode: '6-अंकीय पिन कोड (वैकल्पिक)',
      latitude: 'अक्षांश (Latitude)',
      longitude: 'देशांतर (Longitude)',
      websiteOptional: 'आधिकारिक वेबसाइट (वैकल्पिक)',
      phoneOptional: 'संपर्क फ़ोन (वैकल्पिक)',
      pendingNotice:
        'नागरिक द्वारा सुझाए गए कार्यालय प्रशासक की समीक्षा और स्वीकृति तक लंबित रहते हैं।',
      submitButton: 'समीक्षा के लिए जमा करें',
      successMessage:
        'धन्यवाद! आपका कार्यालय सुझाव जमा हो गया है और प्रशासनिक समीक्षा के लिए लंबित है।',
    },
    auth: {
      title: 'नागरिक साइन इन',
      signUpTitle: 'नया नागरिक खाता बनाएं',
      subtitle:
        'कतार रिपोर्ट और कार्यालय सुझाव जमा करने के लिए अपने ईमेल और पासवर्ड से साइन इन करें। कार्यालय देखने के लिए लॉगिन आवश्यक नहीं है।',
      signInTab: 'साइन इन',
      signUpTab: 'खाता बनाएं',
      emailLabel: 'ईमेल पता',
      emailPlaceholder: 'citizen@example.com',
      passwordLabel: 'पासवर्ड',
      passwordPlaceholder: 'अपना पासवर्ड दर्ज करें',
      confirmPasswordLabel: 'पासवर्ड की पुष्टि करें',
      signInButton: 'साइन इन करें',
      signUpButton: 'खाता बनाएं',
      passwordMismatch: 'दोनों पासवर्ड मेल नहीं खाते।',
      passwordTooShort: 'पासवर्ड कम से कम 6 अक्षरों का होना चाहिए।',
      signOut: 'साइन आउट',
      displayName: 'प्रदर्शन नाम',
      preferredLanguage: 'पसंदीदा भाषा',
      memberSince: 'खाता निर्माण तिथि',
      profileUpdated: 'प्रोफ़ाइल सफलतापूर्वक सहेजी गई।',
    },
    supabaseNotice: {
      title: 'डेटाबेस और लॉगिन के लिए Supabase कॉन्फ़िगरेशन आवश्यक है',
      description:
        'अखिल भारतीय OpenStreetMap खोज और मानचित्र अभी सक्रिय हैं। वास्तविक लॉगिन, कतार रिपोर्ट संग्रहण, रीयलटाइम अपडेट और प्रशासनिक मॉडरेशन के लिए Supabase क्रेडेंशियल सेट करें।',
      envListLabel: 'आवश्यक एनवायरनमेंट वेरिएबल',
    },
  },
};
