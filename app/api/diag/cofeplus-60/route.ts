import { NextRequest, NextResponse } from 'next/server'
import { isDiagAuthorized, runCofeplusDiagnostics } from '@/lib/cofeplus/diag'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  if (!isDiagAuthorized(request.headers.get('x-diag-token'))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(await runCofeplusDiagnostics('60s (latte-art)'))
}
