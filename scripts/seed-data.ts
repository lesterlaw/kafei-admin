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

  // Seed Subscription Tiers
  console.log('Seeding subscription tiers...')
  const subscriptionTiers = [
    {
      name: 'Monthly Plan',
      description: 'Perfect for trying out our service',
      price: 29.00,
      period: 'monthly',
      features: ['1 coffee per day', 'Exclusive deals', 'Priority support'],
      coupon_per_day: 1,
    },
    {
      name: 'Annual Plan',
      description: 'Best value for coffee lovers',
      price: 299.00,
      period: 'annual',
      features: ['1 coffee per day', '2 months free', 'Exclusive deals', 'Priority support', 'Early access to new drinks'],
      coupon_per_day: 1,
    },
    {
      name: '3-Year Plan',
      description: 'Ultimate savings for dedicated fans',
      price: 599.00,
      period: '3year',
      features: ['1 coffee per day', 'Biggest savings', 'All perks included', 'VIP support', 'Exclusive merchandise'],
      coupon_per_day: 2,
    },
  ]

  for (const tier of subscriptionTiers) {
    // Check if exists
    const { data: existing } = await supabase
      .from('subscription_tiers')
      .select('id')
      .eq('name', tier.name)
      .single()

    if (existing) {
      console.log(`  - ${tier.name} already exists, skipping`)
      continue
    }

    const { error } = await supabase
      .from('subscription_tiers')
      .insert(tier)

    if (error) {
      console.error(`Failed to seed tier ${tier.name}:`, error.message)
    } else {
      console.log(`  - ${tier.name} seeded`)
    }
  }

  // Seed Products (Coffee Drinks)
  console.log('\nSeeding products...')
  const products = [
    {
      name: 'Espresso',
      description: 'Strong concentrated coffee shot',
      price: 3.50,
      temperature: 'hot',
      is_hidden: false,
    },
    {
      name: 'Americano',
      description: 'Espresso with hot water',
      price: 4.00,
      temperature: 'both',
      is_hidden: false,
    },
    {
      name: 'Latte',
      description: 'Espresso with steamed milk',
      price: 5.00,
      temperature: 'both',
      is_hidden: false,
    },
    {
      name: 'Cappuccino',
      description: 'Espresso with foamed milk',
      price: 5.00,
      temperature: 'hot',
      is_hidden: false,
    },
    {
      name: 'Mocha',
      description: 'Espresso with chocolate and steamed milk',
      price: 5.50,
      temperature: 'both',
      is_hidden: false,
    },
    {
      name: 'Chai Latte',
      description: 'Spiced tea with steamed milk',
      price: 5.00,
      temperature: 'both',
      is_hidden: false,
    },
    {
      name: 'Flat White',
      description: 'Double espresso with velvety milk',
      price: 5.00,
      temperature: 'hot',
      is_hidden: false,
    },
    {
      name: 'Macchiato',
      description: 'Espresso marked with foamed milk',
      price: 4.00,
      temperature: 'hot',
      is_hidden: false,
    },
    {
      name: 'Cold Brew',
      description: 'Smooth, slow-steeped cold coffee',
      price: 5.00,
      temperature: 'cold',
      is_hidden: false,
    },
    {
      name: 'Iced Matcha Latte',
      description: 'Japanese green tea with milk over ice',
      price: 5.50,
      temperature: 'cold',
      is_hidden: false,
    },
  ]

  for (const product of products) {
    const { data: existing } = await supabase
      .from('products')
      .select('id')
      .eq('name', product.name)
      .single()

    if (existing) {
      console.log(`  - ${product.name} already exists, skipping`)
      continue
    }

    const { error } = await supabase
      .from('products')
      .insert(product)

    if (error) {
      console.error(`Failed to seed product ${product.name}:`, error.message)
    } else {
      console.log(`  - ${product.name} seeded`)
    }
  }

  // Seed Add-ons
  console.log('\nSeeding add-ons...')
  const addOns = [
    {
      name: 'Extra Shot',
      description: 'Add an extra espresso shot',
      price: 1.00,
      temperature: 'both',
      is_hidden: false,
    },
    {
      name: 'Oat Milk',
      description: 'Substitute with oat milk',
      price: 0.80,
      temperature: 'both',
      is_hidden: false,
    },
    {
      name: 'Almond Milk',
      description: 'Substitute with almond milk',
      price: 0.80,
      temperature: 'both',
      is_hidden: false,
    },
    {
      name: 'Soy Milk',
      description: 'Substitute with soy milk',
      price: 0.60,
      temperature: 'both',
      is_hidden: false,
    },
    {
      name: 'Vanilla Syrup',
      description: 'Add vanilla flavoring',
      price: 0.50,
      temperature: 'both',
      is_hidden: false,
    },
    {
      name: 'Caramel Syrup',
      description: 'Add caramel flavoring',
      price: 0.50,
      temperature: 'both',
      is_hidden: false,
    },
    {
      name: 'Hazelnut Syrup',
      description: 'Add hazelnut flavoring',
      price: 0.50,
      temperature: 'both',
      is_hidden: false,
    },
    {
      name: 'Whipped Cream',
      description: 'Top with whipped cream',
      price: 0.50,
      temperature: 'both',
      is_hidden: false,
    },
  ]

  for (const addon of addOns) {
    const { data: existing } = await supabase
      .from('add_ons')
      .select('id')
      .eq('name', addon.name)
      .single()

    if (existing) {
      console.log(`  - ${addon.name} already exists, skipping`)
      continue
    }

    const { error } = await supabase
      .from('add_ons')
      .insert(addon)

    if (error) {
      console.error(`Failed to seed add-on ${addon.name}:`, error.message)
    } else {
      console.log(`  - ${addon.name} seeded`)
    }
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

