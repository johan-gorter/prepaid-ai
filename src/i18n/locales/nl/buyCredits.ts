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
    contextExact: "Deze actie kost {credits} credits (${usd}).",
    contextRange: "Deze actie kost {lo}–{hi} credits (${loUsd}–${hiUsd}).",
    contextReassurance:
      "Je werk blijft bewaard — na het betalen ga je direct verder.",
    optionLabel: "{credits} credits — ${usd}",
    presetHint75: "≈ 7 acties",
    customOption: "Eigen aantal",
    customAmountAria: "Eigen creditbedrag",
    trustLine1:
      "Geen abonnement · je credits verlopen nooit · veilig betalen via Stripe",
    trustLine2: "Minimaal 75 credits vanwege transactiekosten.",
    betweenHint: "Tussen {min} en {max} credits.",
    waiverLabel:
      "Ik ga akkoord met directe levering en zie af van mijn 14-dagen herroepingsrecht.",
    ctaPay: "Verder naar betalen — ${usd}",
    ctaLoginHint: "Je logt eerst even in.",
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
