import { getUncachableStripeClient } from "./stripeClient";

async function seedProducts() {
  const stripe = await getUncachableStripeClient();

  const existing = await stripe.products.search({ query: "metadata['app']:'a0p'" });
  if (existing.data.length > 0) {
    console.log("Products already exist, skipping seed");
    for (const p of existing.data) {
      const prices = await stripe.prices.list({ product: p.id, active: true });
      console.log(`  ${p.name} (${p.id})`);
      for (const pr of prices.data) {
        console.log(`    Price: ${pr.id} - $${(pr.unit_amount || 0) / 100} ${pr.recurring ? pr.recurring.interval : "one-time"}`);
      }
    }
    return;
  }

  console.log("Creating a0p products...");

  const core = await stripe.products.create({
    name: "Core Access",
    description: "Full console access, EDCM instrumentation, hourly heartbeat, BYO API keys, cost telemetry",
    metadata: { app: "a0p", tier: "core" },
  });
  await stripe.prices.create({
    product: core.id,
    unit_amount: 1500,
    currency: "usd",
    recurring: { interval: "month" },
    metadata: { app: "a0p", tier: "core" },
  });
  console.log("Created: Core Access ($15/mo)");

  const founder = await stripe.products.create({
    name: "Founder",
    description: "Founder registry listing, founder badge, locked $15 base rate, early refinement channel. Limited to 53.",
    metadata: { app: "a0p", tier: "founder", limited: "53" },
  });
  await stripe.prices.create({
    product: founder.id,
    unit_amount: 15300,
    currency: "usd",
    metadata: { app: "a0p", tier: "founder" },
  });
  console.log("Created: Founder ($153 one-time)");

  for (const amt of [1, 2, 5]) {
    const support = await stripe.products.create({
      name: `Support +$${amt}`,
      description: `Optional support donation of $${amt}`,
      metadata: { app: "a0p", tier: "support", amount: String(amt) },
    });
    await stripe.prices.create({
      product: support.id,
      unit_amount: amt * 100,
      currency: "usd",
      metadata: { app: "a0p", tier: "support" },
    });
    console.log(`Created: Support +$${amt}`);
  }

  for (const amt of [10, 25, 50]) {
    const credit = await stripe.products.create({
      name: `Compute Credits $${amt}`,
      description: `$${amt} compute credit block - API cost + infrastructure overhead`,
      metadata: { app: "a0p", tier: "credit", amount: String(amt) },
    });
    await stripe.prices.create({
      product: credit.id,
      unit_amount: amt * 100,
      currency: "usd",
      metadata: { app: "a0p", tier: "credit" },
    });
    console.log(`Created: Compute Credits $${amt}`);
  }

  console.log("Done seeding products!");
}

seedProducts().catch(console.error);
