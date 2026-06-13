import type { LoginMessages } from "../en/login";

const login: LoginMessages = {
  login: {
    reimagineYourSpace: "Geef je ruimte opnieuw vorm met AI",
    withGoogle: "Inloggen met Google",
    withMicrosoft: "Inloggen met Microsoft",
    withApple: "Inloggen met Apple",
    errorAccountExists:
      "Er bestaat al een account met dit e-mailadres via een andere inlogmethode. Log in met de methode die je oorspronkelijk hebt gebruikt.",
    errorGeneric: "Inloggen mislukt. Probeer het opnieuw.",
    termsPrefix: "Door in te loggen ga je akkoord met onze {terms}.",
    termsLink: "Servicevoorwaarden",
    devMode: "Dev- / emulatormodus",
    devSeedHint: "Voer {command} één keer uit om deze gebruiker aan te maken.",
    devLogin: "Dev-login ({email})",
    devLoginFailed:
      "Dev-login mislukt.\n\nZorg dat je dit hebt uitgevoerd:\n  npm run emulators:seed",
  },
  account: {
    title: "Account",
    lastActivity: "Laatste activiteit",
    noActivity: "Nog geen activiteit geregistreerd.",
    dangerZone: "Gevarenzone",
    deleteAccount: "Account verwijderen",
    deleteDescription:
      "Verwijder je account en alle bijbehorende gegevens permanent, inclusief alle make-overs, impressies en geüploade afbeeldingen. Deze actie kan niet ongedaan worden gemaakt.",
    deleteButton: "Mijn account verwijderen",
    areYouSure: "Weet je het zeker?",
    areYouSureDetail: "Hiermee wordt alles permanent verwijderd.",
    confirmDelete: "Ja, verwijder alles",
    deleting: "Bezig met verwijderen...",
    deleteFailed: "Account verwijderen mislukt",
  },
};

export default login;
