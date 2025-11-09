# Database Setup Instructions

## Step 1: Run the SQL Migrations

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Create a new query
4. Copy and paste the contents of `supabase/migrations/001_initial_schema.sql`
5. Run the query
6. Then run `supabase/migrations/002_fix_admin_rls.sql` (if you already ran 001, this will fix the RLS issue)

**Important**: If you already ran migration 001, you MUST run migration 002 to fix the admin access issue.

## Step 2: Seed the Admin User

After running the migrations, run the seed script:

```bash
npm run seed:admin
```

This will create the initial admin user:
- Email: `admin@admin.com`
- Password: `admin@123`

## Database Schema Overview

The migration creates the following tables:

- **admins** - Administrator accounts
- **users** - User profiles (extends auth.users)
- **subscription_tiers** - Subscription plan tiers
- **user_subscriptions** - User subscription records
- **transactions** - Payment transactions
- **products** - Coffee products
- **add_ons** - Product add-ons
- **product_addons** - Junction table for products and add-ons
- **kiosks** - Kiosk locations
- **orders** - Order records
- **order_items** - Order line items
- **coupons** - Daily coupons
- **referrals** - Referral tracking
- **support_tickets** - Customer support tickets
- **notifications** - Notification templates
- **subpages** - Static pages (Privacy Policy, Terms, etc.)

All tables have Row Level Security (RLS) enabled with appropriate policies for admin and user access.

## Troubleshooting

If you get "Access denied. Admin access required" error:

1. Make sure you've run migration 002 (`002_fix_admin_rls.sql`)
2. Verify the admin user exists in the `admins` table
3. Check that you're logged in with the correct admin credentials
