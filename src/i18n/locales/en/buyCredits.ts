// Everything money: balance/ledger, buying credits, sending credit gifts,
// and the post-checkout success page.
const buyCredits = {
  balance: {
    title: "Balance",
    creditsAmount: "{count} credits",
    currentBalance: "Current balance",
    buyCredits: "Buy credits",
    sendCredits: "Send credits",
    recentTransactions: "Recent transactions",
    noTransactions: "No transactions yet.",
    reasonCol: "Reason",
    amountCol: "Amount",
    balanceCol: "Balance",
    reason: {
      image_generation: "Image generation",
      chat_message: "Chat message",
      credit_purchase: "Credit purchase",
      admin_adjustment: "Admin adjustment",
      credit_transfer_sent: "Credit gift sent",
      credit_transfer_received: "Credit gift received",
      credit_transfer_refunded: "Credit gift refunded",
    },
  },
  buyCredits: {
    title: "Buy credits",
    contextExact: "This action costs {credits} credits (${usd}).",
    contextRange: "This action costs {lo}–{hi} credits (${loUsd}–${hiUsd}).",
    contextReassurance:
      "Your work is saved — you'll continue right after paying.",
    optionLabel: "{credits} credits — ${usd}",
    presetHint75: "≈ 7 actions",
    customOption: "Custom amount",
    customAmountAria: "Custom credit amount",
    trustLine1:
      "No subscription · your credits never expire · secure payment via Stripe",
    trustLine2: "Minimum 75 credits due to transaction costs.",
    betweenHint: "Between {min} and {max} credits.",
    waiverLabel:
      "I agree to immediate delivery and waive my 14-day right of withdrawal.",
    ctaPay: "Continue to payment — ${usd}",
    ctaLoginHint: "You'll sign in first.",
    startingCheckout: "Starting checkout...",
    errorGeneric: "Failed to start checkout",
  },
  sendCredits: {
    title: "Send credits",
    giftOnWay: "Gift on its way",
    giftOnWayDetail:
      "If {email} has an account they'll be asked to accept the {amount} credits. The credits are reserved until they accept, and return to your balance automatically if they don't accept within 24 hours.",
    formIntro:
      "Send credits from your balance to someone by their email address. You currently have {balance}.",
    balanceCredits: "{count} credits",
    recipientEmail: "Recipient email",
    amountLabel: "Amount (credits)",
    sending: "Sending…",
    sendGift: "Send gift",
    errorGeneric: "Failed to send credits",
  },
  checkoutSuccess: {
    paymentSuccess: "Payment successful!",
    creditsAppear:
      "Your credits will appear in your balance within a few seconds.",
    viewBalance: "View balance",
    session: "Session: {id}",
  },
};

export type BuyCreditsMessages = typeof buyCredits;
export default buyCredits;
