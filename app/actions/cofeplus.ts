'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { CofeplusRequestOptions, CofeplusResponse } from '@/lib/cofeplus/client'
import {
  getCofeplusConfig,
  type CofeplusEnvironment,
} from '@/lib/cofeplus/config'
import {
  generateCofeplusJwt,
  type GenerateCofeplusJwtResult,
} from '@/lib/cofeplus/jwt'
import {
  executeCofeplusRequest,
  resolveCofeplusEnvironment,
} from '@/lib/cofeplus/proxy'

async function verifyAdmin() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Not authenticated')
  }

  const { data: admin } = await supabase
    .from('admins')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!admin) {
    throw new Error('Admin access required')
  }

  return admin
}

export async function getCofeplusEnvConfig() {
  await verifyAdmin()
  const test = getCofeplusConfig('test')
  const live = getCofeplusConfig('live')
  return {
    kid: test.kid,
    issuer: test.issuer,
    subject: test.subject,
    audience: test.audience,
    scope: test.scope,
    hasAccessToken: Boolean(test.accessToken),
    hasHmacSecret: test.hasTestHmacSecret,
    hasTestHmacSecret: test.hasTestHmacSecret,
    hasLiveHmacSecret: live.hasLiveHmacSecret,
    testBaseUrl: test.baseUrl,
    liveBaseUrl: live.baseUrl,
    /** Default for initial UI load */
    baseUrl: test.baseUrl,
  }
}

export async function mintCofeplusAccessToken(
  expiresInSeconds = 3600,
  environment: CofeplusEnvironment = 'test'
): Promise<GenerateCofeplusJwtResult> {
  await verifyAdmin()
  const env = resolveCofeplusEnvironment(environment)
  console.log(`[cofeplus] mint JWT env=${env} expiresIn=${expiresInSeconds}s`)
  const minted = generateCofeplusJwt(expiresInSeconds, env)
  console.log(
    `[cofeplus] minted JWT kid=${minted.header.kid} iss=${minted.payload.iss} scope=${minted.payload.scope} exp=${minted.payload.exp}`
  )
  return minted
}

export async function proxyCofeplusRequest(
  options: CofeplusRequestOptions & {
    skipAuth?: boolean
    environment?: CofeplusEnvironment
  }
): Promise<CofeplusResponse> {
  await verifyAdmin()
  return executeCofeplusRequest(options)
}
