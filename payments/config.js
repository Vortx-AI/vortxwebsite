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
    // DUMMY: Razorpay's public sample TEST key, so the Checkout
    // modal opens locally. Replace with your own rzp_test_ / rzp_live_ key.
    keyId: 'rzp_live_jAQEp4vlDYSJWG',
    // Currency set to USD for global payments (including PayPal).
    // Razorpay will auto-convert and settle in your local currency.
    currency: 'USD',
    name: 'Vortx AI',
    themeColor: '#0b8f6e'
  },

  tiers: {
    // Students, researchers, early-stage startups. No charge; straight to a slot.
    student: {
      label: 'Students & startups',
      price: 'Free',
      amount: null
    },

    // Companies putting emem / geo.qa into production.
    enterprise: {
      label: 'Enterprise',
      price: '$5,000',
      // DUMMY amount in the smallest unit of `razorpay.currency`
      // (paise for INR). Set the real charge amount before going live.
      amount: 500000,
      // Optional: a hosted Razorpay Payment Page URL. Used only if
      // razorpay.keyId is left blank (redirect fallback).
      paymentPageUrl: null
    },

    // Government, defense, critical infrastructure.
    government: {
      label: 'Governments & defense',
      price: '$25,000',
      amount: 2500000,
      paymentPageUrl: null
    }
  }
};
