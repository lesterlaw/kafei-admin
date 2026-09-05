import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function seedData() {
  if (!supabaseServiceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for seeding')
  }

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is required for seeding')
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  console.log('Starting data seed...\n')

  // Seed Subscription Tiers (Free / Monthly $29 / Annual $249)
  console.log('Seeding subscription tiers...')
  const subscriptionTiers = [
    {
      name: 'Free Plan',
      description: 'First drink + Stamps + Beans + Ads',
      price: 0,
      period: 'free',
      features: [
        'Welcome: 1 Latte/Americano + 5 Beans',
        '7 Stamps = 1 Latte or Americano',
        'Daily check-in: +1 Stamp + 5 Beans',
        'Basic Bean rewards (60-day expiry)',
      ],
      coupon_per_day: 0,
      is_hidden: false,
    },
    {
      name: 'Monthly Plan',
      description: 'Daily All-Drinks membership — 1 coupon / 24h, Beans, no ads',
      price: 29.0,
      period: 'monthly',
      features: [
        '1 All-Drinks coupon every 24h',
        'Daily check-in: +5 Beans',
        'All Bean rewards (no Free-plan expiry)',
        'Second cup 50% off',
      ],
      coupon_per_day: 1,
      is_hidden: false,
    },
    {
      name: 'Annual Plan',
      description:
        'Same membership, best value — All Drinks, 5 Beans/day, full Bean rewards',
      price: 249.0,
      period: 'annual',
      features: [
        '1 All-Drinks coupon every 24h',
        'Daily check-in: +5 Beans',
        'All Bean rewards (no Free-plan expiry)',
        'Second cup 50% off',
        'Effective $20.75 / month',
      ],
      coupon_per_day: 1,
      is_hidden: false,
    },
  ]

  for (const tier of subscriptionTiers) {
    const { data: existing } = await supabase
      .from('subscription_tiers')
      .select('id')
      .eq('period', tier.period)
      .maybeSingle()

    if (existing) {
      const { error: updErr } = await supabase
        .from('subscription_tiers')
        .update({ ...tier, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
      if (updErr) {
        console.error(`Failed to update tier ${tier.name}:`, updErr.message)
      } else {
        console.log(`  - ${tier.name} updated`)
      }
      continue
    }

    const { error } = await supabase.from('subscription_tiers').insert(tier)

    if (error) {
      console.error(`Failed to seed tier ${tier.name}:`, error.message)
    } else {
      console.log(`  - ${tier.name} seeded`)
    }
  }

  // Hide legacy 3-year / old annual names
  await supabase
    .from('subscription_tiers')
    .update({ is_hidden: true })
    .or('name.ilike.%3-year%,name.ilike.%3 year%,name.ilike.%legacy%')

  // Seed Products (Coffee Drinks) — kiosk menu: hot / iced variants with fixed prices
  console.log('\nSeeding products...')
  const products = [
    {
      name: 'Hot Latte',
      description: 'Espresso with steamed milk',
      price: 4.0,
      temperature: 'hot',
      is_hidden: false,
    },
    {
      name: 'Iced Latte',
      description: 'Espresso with cold milk over ice',
      price: 4.5,
      temperature: 'cold',
      is_hidden: false,
    },
    {
      name: 'Hot Cappuccino',
      description: 'Espresso with foamed milk',
      price: 4.0,
      temperature: 'hot',
      is_hidden: false,
    },
    {
      name: 'Iced Cappuccino',
      description: 'Espresso with foamed milk over ice',
      price: 4.5,
      temperature: 'cold',
      is_hidden: false,
    },
    {
      name: 'Hot Mocha',
      description: 'Espresso with chocolate and steamed milk',
      price: 4.5,
      temperature: 'hot',
      is_hidden: false,
    },
    {
      name: 'Iced Mocha',
      description: 'Espresso with chocolate and milk over ice',
      price: 5.0,
      temperature: 'cold',
      is_hidden: false,
    },
    {
      name: 'Hot Americano',
      description: 'Espresso with hot water',
      price: 3.0,
      temperature: 'hot',
      is_hidden: false,
    },
    {
      name: 'Iced Americano',
      description: 'Espresso with cold water over ice',
      price: 3.5,
      temperature: 'cold',
      is_hidden: false,
    },
    {
      name: 'Hot Chocolate',
      description: 'Rich chocolate drink',
      price: 3.0,
      temperature: 'hot',
      is_hidden: false,
    },
    {
      name: 'Iced Chocolate',
      description: 'Rich chocolate drink over ice',
      price: 3.5,
      temperature: 'cold',
      is_hidden: false,
    },
  ]
  const productNames = products.map((product) => product.name)

  const { error: hideProductsError } = await supabase
    .from('products')
    .update({ is_hidden: true, updated_at: new Date().toISOString() })
    .not('id', 'is', null)

  if (hideProductsError) {
    console.error('Failed to hide existing products:', hideProductsError.message)
  }

  for (const product of products) {
    const { data: existingProducts, error: lookupError } = await supabase
      .from('products')
      .select('id')
      .eq('name', product.name)

    if (lookupError) {
      console.error(`Failed to check product ${product.name}:`, lookupError.message)
      continue
    }

    const existingProduct = existingProducts?.[0]

    if (existingProduct) {
      const { error } = await supabase
        .from('products')
        .update({ ...product, updated_at: new Date().toISOString() })
        .eq('id', existingProduct.id)

      if (error) {
        console.error(`Failed to update product ${product.name}:`, error.message)
      } else {
        console.log(`  - ${product.name} updated`)
      }

      continue
    }

    const { error } = await supabase.from('products').insert(product)

    if (error) {
      console.error(`Failed to seed product ${product.name}:`, error.message)
    } else {
      console.log(`  - ${product.name} seeded`)
    }
  }

  console.log(`  - Active drink menu: ${productNames.join(', ')}`)

  // Add-ons come from CofePlus catalog sync — do not seed a fake list.
  // Hide any legacy manual add-ons.
  console.log('\nHiding legacy seeded add-ons (use CofePlus Sync instead)...')
  const { error: hideAddOnsError } = await supabase
    .from('add_ons')
    .update({ is_hidden: true, updated_at: new Date().toISOString() })
    .in('name', ['Oat Milk', 'Espresso', 'Flavors'])

  if (hideAddOnsError) {
    console.error('Failed to hide legacy add-ons:', hideAddOnsError.message)
  } else {
    console.log('  - Legacy Oat Milk / Espresso / Flavors hidden')
  }

  // Seed Kiosks
  console.log('\nSeeding kiosks...')
  const kiosks = [
    {
      name: 'Kafei Central',
      location: 'Downtown',
      address: '123 Main Street, Central District',
      latitude: 1.2897,
      longitude: 103.8501,
      is_active: true,
    },
    {
      name: 'Kafei Marina',
      location: 'Marina Bay',
      address: '1 Bayfront Avenue, Marina Bay Sands',
      latitude: 1.2834,
      longitude: 103.8607,
      is_active: true,
    },
    {
      name: 'Kafei Orchard',
      location: 'Orchard Road',
      address: '290 Orchard Road, Paragon',
      latitude: 1.3039,
      longitude: 103.8358,
      is_active: true,
    },
    {
      name: 'Kafei Raffles',
      location: 'Raffles Place',
      address: '1 Raffles Place, One Raffles Place',
      latitude: 1.2840,
      longitude: 103.8510,
      is_active: true,
    },
    {
      name: 'Kafei Bugis',
      location: 'Bugis',
      address: '200 Victoria Street, Bugis Junction',
      latitude: 1.2993,
      longitude: 103.8555,
      is_active: true,
    },
    {
      name: 'Kafei Jurong',
      location: 'Jurong East',
      address: '50 Jurong Gateway Road, JEM',
      latitude: 1.3332,
      longitude: 103.7436,
      is_active: true,
    },
  ]

  for (const kiosk of kiosks) {
    const { data: existing } = await supabase
      .from('kiosks')
      .select('id')
      .eq('name', kiosk.name)
      .single()

    if (existing) {
      console.log(`  - ${kiosk.name} already exists, skipping`)
      continue
    }

    const { error } = await supabase
      .from('kiosks')
      .insert(kiosk)

    if (error) {
      console.error(`Failed to seed kiosk ${kiosk.name}:`, error.message)
    } else {
      console.log(`  - ${kiosk.name} seeded`)
    }
  }

  // Seed Subpages (Terms, Privacy, etc.)
  console.log('\nSeeding subpages...')
  const subpages = [
    {
      title: 'Terms & Conditions',
      slug: 'terms',
      content: `# Terms & Conditions

Last updated: December 2024

## 1. Acceptance of Terms
By accessing and using the Kafei app and services, you agree to be bound by these Terms & Conditions.

## 2. Subscription Services
- Subscriptions are billed according to the plan selected
- Unused daily coffee credits do not roll over
- Subscriptions auto-renew unless cancelled

## 3. Refund Policy
- Refunds are available within 7 days of purchase
- No refunds for partially used subscription periods

## 4. User Conduct
- Users must be 18 years or older
- Accounts are non-transferable
- Abuse of the service may result in account termination

## 5. Contact
For questions, contact support@kafei.app`,
    },
    {
      title: 'Privacy Policy',
      slug: 'privacy',
      content: `# Privacy Policy

Last updated: December 2024

## 1. Information We Collect
- Personal information (name, email, phone)
- Usage data and preferences
- Payment information (processed securely via Stripe)

## 2. How We Use Your Information
- To provide and improve our services
- To process transactions
- To send important updates

## 3. Data Security
We implement industry-standard security measures to protect your data.

## 4. Your Rights
You have the right to access, correct, or delete your personal data.

## 5. Contact
For privacy inquiries, contact privacy@kafei.app`,
    },
    {
      title: 'FAQ',
      slug: 'faq',
      content: `# Frequently Asked Questions

## How do I redeem my daily coffee?
Open the app, tap "Get Coffee", select your drink, and show the QR code at any Kafei kiosk.

## Can I change my subscription plan?
Yes, you can upgrade or downgrade your plan at any time from the Profile section.

## What happens if I miss a day?
Unused daily credits do not roll over to the next day.

## How do I cancel my subscription?
Go to Profile > Manage Subscription > Cancel Subscription.

## Is there a referral program?
Yes! Share your referral code and earn rewards when friends sign up.`,
    },
  ]

  for (const page of subpages) {
    const { data: existing } = await supabase
      .from('subpages')
      .select('id')
      .eq('slug', page.slug)
      .single()

    if (existing) {
      console.log(`  - ${page.title} already exists, skipping`)
      continue
    }

    const { error } = await supabase
      .from('subpages')
      .insert(page)

    if (error) {
      console.error(`Failed to seed subpage ${page.title}:`, error.message)
    } else {
      console.log(`  - ${page.title} seeded`)
    }
  }

  console.log('\nData seed completed!')
}

seedData()
  .then(() => {
    console.log('\nAll data seeded successfully!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\nSeed failed:', error)
    process.exit(1)
  })

