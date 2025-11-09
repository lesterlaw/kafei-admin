import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function seedAdmin() {
  if (!supabaseServiceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for seeding')
  }

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is required for seeding')
  }

  // Use service role key to bypass RLS
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  const email = 'admin@admin.com'
  const password = 'admin@123'
  const fullName = 'Admin User'

  try {
    // Check if admin already exists in admins table
    const { data: existingAdmins, error: checkError } = await supabase
      .from('admins')
      .select('*')
      .eq('email', email)
      .maybeSingle()

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking existing admin:', checkError)
    }

    if (existingAdmins) {
      console.log('Admin already exists in admins table')
      console.log('Admin ID:', existingAdmins.id)
      return
    }

    // Check if auth user exists
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers()
    
    let authUser = users?.find(u => u.email === email)

    if (!authUser) {
      // Create auth user
      console.log('Creating auth user...')
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })

      if (authError) {
        throw new Error(`Failed to create auth user: ${authError.message}`)
      }

      if (!authData.user) {
        throw new Error('Failed to create auth user: No user returned')
      }

      authUser = authData.user
      console.log('Auth user created:', authUser.id)
    } else {
      console.log('Auth user already exists:', authUser.id)
    }

    // Create admin record using service role (bypasses RLS)
    console.log('Creating admin record...')
    const { data: adminData, error: adminError } = await supabase
      .from('admins')
      .insert({
        id: authUser.id,
        email,
        full_name: fullName,
      })
      .select()
      .single()

    if (adminError) {
      console.error('Admin insert error:', adminError)
      throw new Error(`Failed to create admin record: ${adminError.message}`)
    }

    console.log('Admin seeded successfully!')
    console.log('Email:', email)
    console.log('Password:', password)
    console.log('Admin ID:', adminData.id)
    
    // Verify the admin record exists
    const { data: verifyAdmin, error: verifyError } = await supabase
      .from('admins')
      .select('*')
      .eq('id', authUser.id)
      .single()

    if (verifyError) {
      console.warn('Warning: Could not verify admin record:', verifyError.message)
    } else {
      console.log('Verified admin record:', verifyAdmin)
    }
  } catch (error: any) {
    console.error('Error seeding admin:', error.message)
    console.error('Full error:', error)
    throw error
  }
}

seedAdmin()
  .then(() => {
    console.log('Seed completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Seed failed:', error)
    process.exit(1)
  })
