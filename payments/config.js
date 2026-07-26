/* ============================================================
   Vortx AI · payment + booking config
   THE ONE FILE YOU EDIT to go live.

   Nothing here is secret. It ships to the browser, so it holds
   only public, front-end-safe values: the Razorpay PUBLIC key id
   (rzp_test_... / rzp_live_...) and a public scheduling link.
   NEVER put an API secret, key_secret, or webhook secret here.

   The flow, with no backend:
     pick a tier  ->  fill the on-page form  ->
       paid tiers:  open the Razorpay Checkout modal (prefilled).
                    On success, go to schedulingUrl to pick a time.
       free tier:   go straight to schedulingUrl.

   GO LIVE:
   1. Replace `razorpay.keyId` with your own key id. Use your
      rzp_test_... key while testing, rzp_live_... when live.
   2. Set the real `amount` (in the currency's smallest unit) and
      `currency` for each paid tier.
   3. NOTE: a robust production setup creates an order server-side
      and passes its order_id here. This static build opens Checkout
      with amount only (fine for test / low-volume). Add order_id
      once you have a small endpoint.
   ============================================================ */
window.VORTX_PAY = {
  contact: 'avijeet@vortx.ai',

  // Where people pick a time: directly for the free tier, and
  // after a successful payment for the paid tiers.
  schedulingUrl: 'https://outlook.office.com/book/meetvortxfounders@vortx.ai/',

  razorpay: {
    // LIVE public key id. Safe to ship in the browser; the secret
    // stays in the Razorpay dashboard. Swap to rzp_test_... to test.
    keyId: 'rzp_live_jAQEp4vlDYSJWG',
    // Currency set to USD for global payments (including PayPal).
    // Razorpay will auto-convert and settle in your local currency.
    currency: 'USD',
    name: 'Vortx AI',
    themeColor: '#0b8f6e'
  },

  tiers: {
    // Community office hours. 30 min, open to all, no charge, no form:
    // the section and modal link straight to schedulingUrl.
    office: {
      label: 'Office hours',
      price: 'Free',
      amount: null
    },

    // Integration session: the core team pairs on the client's codebase.
    // Money-back if they leave without a working integration.
    integration: {
      label: 'Integration session',
      price: '$5,000',
      // Amount in the smallest unit of `razorpay.currency`
      // (cents for USD): 500000 = $5,000.00.
      amount: 500000,
      // Optional: a hosted Razorpay Payment Page URL. Used only if
      // razorpay.keyId is left blank (redirect fallback).
      paymentPageUrl: null
    },

    // Sovereign session: governments, defense, critical infrastructure.
    government: {
      label: 'Sovereign session',
      price: '$25,000',
      // 2500000 cents = $25,000.00.
      amount: 2500000,
      paymentPageUrl: null
    }
  }
};
