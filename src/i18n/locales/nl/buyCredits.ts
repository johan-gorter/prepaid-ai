import type { BuyCreditsMessages } from "../en/buyCredits";

const buyCredits: BuyCreditsMessages = {
  balance: {
    title: "Saldo",
    creditsAmount: "{count} credits",
    currentBalance: "Huidig saldo",
    buyCredits: "Credits kopen",
    sendCredits: "Credits versturen",
    recentTransactions: "Recente transacties",
    noTransactions: "Nog geen transacties.",
    reasonCol: "Reden",
    amountCol: "Bedrag",
    balanceCol: "Saldo",
    reason: {
      image_generation: "Afbeelding genereren",
      chat_message: "Chatbericht",
      credit_purchase: "Credits gekocht",
      admin_adjustment: "Beheerdersaanpassing",
      credit_transfer_sent: "Creditgeschenk verzonden",
      credit_transfer_received: "Creditgeschenk ontvangen",
      credit_transfer_refunded: "Creditgeschenk terugbetaald",
    },
  },
  buyCredits: {
    title: "Credits kopen",
    costExact:
      "Deze bewerking kost {credits} credits (${usd}). Je moet credits kopen om door te gaan.",
    costRange:
      "Deze bewerking kost tussen {lo} en {hi} credits (${loUsd} – ${hiUsd}). Je moet credits kopen om door te gaan.",
    chooseAmount: "Kies een bedrag",
    creditsLabel: "credits",
    customAmountTitle: "Of kies een eigen bedrag",
    customAmountAria: "Eigen creditbedrag",
    buyAmount: "Koop {credits} credits (${usd})",
    betweenHint: "Tussen {min} en {max} credits.",
    startingCheckout: "Bezig met afrekenen...",
    errorGeneric: "Afrekenen starten mislukt",
  },
  sendCredits: {
    title: "Credits versturen",
    giftOnWay: "Geschenk is onderweg",
    giftOnWayDetail:
      "Als {email} een account heeft, wordt gevraagd de {amount} credits te accepteren. De credits worden gereserveerd tot acceptatie en keren automatisch terug naar je saldo als ze niet binnen 24 uur worden geaccepteerd.",
    formIntro:
      "Verstuur credits van je saldo naar iemand via hun e-mailadres. Je hebt momenteel {balance}.",
    balanceCredits: "{count} credits",
    recipientEmail: "E-mailadres ontvanger",
    amountLabel: "Bedrag (credits)",
    sending: "Bezig met versturen…",
    sendGift: "Geschenk versturen",
    errorGeneric: "Credits versturen mislukt",
  },
  checkoutSuccess: {
    paymentSuccess: "Betaling geslaagd!",
    creditsAppear: "Je credits verschijnen binnen enkele seconden in je saldo.",
    viewBalance: "Saldo bekijken",
    session: "Sessie: {id}",
  },
};

export default buyCredits;
