const Stripe = require('stripe').default || require('stripe');
async function run() {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  try {
    const subs = await stripe.subscriptions.list({ customer: 'cus_V7ZRIaP9i9Lu1T' });
    console.log(subs.data.map(s => ({ id: s.id, status: s.status })));
  } catch (e) {
    console.error(e);
  }
}
run();
