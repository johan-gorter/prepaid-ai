import type { LegalMessages } from "../en/legal";

const legal: LegalMessages = {
  footer: {
    about: "Over",
    privacy: "Privacyverklaring",
    terms: "Gebruiksvoorwaarden",
    identity: "© {year} johangorter.com · KvK 94834571",
  },
  about: {
    title: "Over payasyougo.app",
    intro:
      "payasyougo.app helpt je je make-over te visualiseren. Combineer je eigen foto's met slimme AI-beeldbewerking. Upload een foto van je ruimte, markeer wat je wilt veranderen, beschrijf je idee en zie meteen het resultaat.",
    colofonTitle: "Wie biedt deze dienst aan",
    colofonTradeName: "Handelsnaam: johangorter.com",
    colofonKvk: "KvK: 94834571",
    colofonEmail: "Contact: {email}",
    colofonCountry: "Nederland",
    colofonVat: "Vrijgesteld van btw (kleineondernemersregeling, KOR).",
    moreLinks: "Zie ook onze {privacy} en {terms}.",
  },
  privacy: {
    title: "Privacyverklaring",
    intro:
      "Deze verklaring legt uit welke persoonsgegevens payasyougo.app verwerkt, waarom, en wat je rechten zijn. We verzamelen alleen het minimum dat nodig is om de dienst te laten werken.",
    dataTitle: "Wat we verzamelen",
    dataAccount:
      "Je account-identiteit (e-mailadres) via je Google- of Microsoft-login.",
    dataPhotos: "Foto's die je uploadt om make-over-impressies te maken.",
    dataChat: "De tekst die je in de privéchat stuurt.",
    dataPayment:
      "Betaalgegevens, verwerkt door Stripe — wij zien je kaartgegevens nooit.",
    processorsTitle: "Wie je gegevens verwerkt",
    processorsIntro: "We werken met een klein aantal vertrouwde verwerkers:",
    processorsFirebase:
      "Google Firebase / Google Cloud — authenticatie, database en opslag van afbeeldingen.",
    processorsVertex:
      "Google Vertex AI / Gemini — genereert make-over-impressies en chatantwoorden.",
    processorsStripe: "Stripe — betalingsverwerking.",
    purposesTitle: "Waarvoor we het gebruiken",
    purposes:
      "We gebruiken je gegevens alleen om de dienst te leveren: je laten inloggen, je impressies en chatantwoorden genereren en bewaren, en betalingen verwerken. We verkopen je gegevens niet en delen ze niet met derden voor advertenties.",
    aiTitle: "AI en jouw inhoud",
    ai: "Je foto's en chatinhoud worden nooit gebruikt om AI-modellen te trainen. Ze worden niet door mensen bekeken, behalve waar dat strikt noodzakelijk is om misbruik te onderzoeken of om aan de wet te voldoen.",
    retentionTitle: "Hoe lang we het bewaren",
    retention:
      "Geüploade afbeeldingen en gegenereerde resultaten worden 12 tot 24 maanden bewaard vanaf de uploaddatum. Je kunt afzonderlijke afbeeldingen verwijderen via de detailpagina van je make-over, of je hele account op elk moment verwijderen via de pagina {account}.",
    storageTitle: "Cookies en lokale opslag",
    storage:
      "We gebruiken alleen functionele opslag in je browser (IndexedDB) om de app te laten werken — bijvoorbeeld je concepten, gecachte afbeeldingen en taalkeuze. We gebruiken geen tracking- of advertentiecookies, dus er is geen cookiebanner.",
    rightsTitle: "Jouw rechten",
    rights:
      "Je hebt het recht om je persoonsgegevens in te zien, te corrigeren of te verwijderen, en om bezwaar te maken tegen of de verwerking ervan te beperken. Neem voor deze rechten contact op via {email}.",
    contactTitle: "Contact",
    contact: "Vragen over je privacy? Mail {email}.",
  },
  terms: {
    title: "Gebruiksvoorwaarden",
    intro:
      "Door payasyougo.app te gebruiken ga je akkoord met deze voorwaarden. Lees ze samen met onze {privacy}.",
    acceptableUseTitle: "Toegestaan gebruik",
    acceptableUseIntro:
      "Je bent verantwoordelijk voor de afbeeldingen die je uploadt. Geüploade afbeeldingen {mustNot} bevatten:",
    mustNot: "mogen geen",
    acceptableUseNoHarmfulContent:
      "Schadelijke, haatdragende, gewelddadige of anderszins aanstootgevende inhoud",
    acceptableUseNoPii: "Persoonlijke of privégegevens (PII) van een persoon",
    acceptableUseNoPeopleWithoutConsent:
      "Herkenbare personen zonder hun uitdrukkelijke toestemming",
    acceptableUseNoLicensePlates:
      "Leesbare kentekenplaten of andere identificerende kenmerken",
    acceptableUseOutro:
      "We behouden ons het recht voor om zonder voorafgaande kennisgeving inhoud te verwijderen die deze richtlijnen schendt.",
    creditsTitle: "Credits",
    credits:
      "Credits koop je vooraf en geef je per actie uit. Credits verlopen nooit. Ze hebben geen geldwaarde en kunnen niet worden uitbetaald, maar ongebruikte credits kunnen wel aan een andere gebruiker worden overgedragen.",
    withdrawalTitle: "Herroepingsrecht",
    withdrawal:
      "Met het kopen van credits krijg je direct toegang tot een digitale dienst. Bij het kopen van credits ga je uitdrukkelijk akkoord met onmiddellijke levering en erken je dat je daarmee afziet van je wettelijke herroepingsrecht van 14 dagen. Je bevestigt dit met een vinkje vóór elke aankoop.",
    ageTitle: "Minimumleeftijd",
    age: "Je moet minstens 13 jaar oud zijn om payasyougo.app te gebruiken. Ben je jonger dan 16, dan mag je de dienst alleen gebruiken met toestemming van een ouder of voogd.",
    aiTitle: "AI-uitvoer",
    ai: "Resultaten worden door AI gegenereerd en kunnen onjuist zijn. Make-over-afbeeldingen zijn illustratieve impressies, geen bouwkundig, architectonisch of technisch advies. Chatantwoorden zijn alleen informatief en vormen geen juridisch, medisch, financieel of ander professioneel advies. Controleer belangrijke beslissingen altijd bij een gekwalificeerde professional.",
    liabilityTitle: "Aansprakelijkheid",
    liability:
      'De dienst wordt geleverd "zoals deze is", zonder enige garantie. Voor zover wettelijk toegestaan zijn wij niet aansprakelijk voor schade die voortvloeit uit het gebruik van de dienst of uit het vertrouwen op door AI gegenereerde uitvoer. We kunnen de dienst op elk moment wijzigen of stopzetten.',
    lawTitle: "Toepasselijk recht",
    law: "Op deze voorwaarden is Nederlands recht van toepassing. Geschillen worden voorgelegd aan de bevoegde Nederlandse rechter.",
    changesTitle: "Wijzigingen",
    changes:
      "We kunnen deze voorwaarden bijwerken. Voortgezet gebruik na wijzigingen geldt als acceptatie van de bijgewerkte voorwaarden.",
  },
};

export default legal;
