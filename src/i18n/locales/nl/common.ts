import type { CommonMessages } from "../en/common";

const common: CommonMessages = {
  common: {
    signIn: "Inloggen",
    signOut: "Uitloggen",
    account: "Account",
    cancel: "Annuleren",
    close: "Sluiten",
    delete: "Verwijderen",
    back: "Terug",
    backToMain: "Terug naar start",
    backToBalance: "Terug naar saldo",
  },
  language: {
    label: "Taal",
    switch: "Taal wijzigen",
    en: "English",
    nl: "Nederlands",
  },
  appBar: {
    homeAriaLabel: "payasyougo startpagina",
  },
  userMenu: {
    menuAriaLabel: "Gebruikersmenu",
    switchToLight: "Naar licht thema",
    switchToDark: "Naar donker thema",
  },
  notification: {
    title: "Melding",
    dismiss: "Sluiten",
    giftTitle: "Je hebt een geschenk ontvangen!",
    giftBody: "{sender} heeft je {amount} gestuurd.",
    giftAmount: "{count} credits",
    decline: "Weigeren",
    accept: "Accepteren",
  },
  share: {
    title: "Impressie delen",
    description: "Iedereen met deze link kan deze resultaatafbeelding bekijken.",
    close: "Sluiten",
    copy: "Kopiëren",
    copied: "Gekopieerd",
    // Message that accompanies the link in the native OS share sheet.
    shareText: "Gemaakt met AI op payasyougo.app",
  },
};

export default common;
