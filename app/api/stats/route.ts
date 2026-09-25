import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'

export async function GET() {
  try {
    const [companiesRes, productsRes, availableChemistriesRes, capacityRes] = await Promise.all([
      supabaseServer.from('companies').select('*', { count: 'exact', head: true }),
      supabaseServer.from('products').select('*', { count: 'exact', head: true }).is('deleted_at', null),
      supabaseServer
        .from('chemistries')
        .select('id, facility_chemistries!inner(facilities!inner(id))', { count: 'exact', head: true })
        .eq('facility_chemistries.facilities.is_active', true)
        .is('facility_chemistries.facilities.deleted_at', null),
      supabaseServer.rpc('get_active_facility_capacity_kl'),
    ])

    const error = companiesRes.error || productsRes.error || availableChemistriesRes.error || capacityRes.error
    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch stats', details: error.message },
        { status: 500 }
      )
    }

    const capacityKl = Number(capacityRes.data ?? 0)

    return NextResponse.json({
      networkPartners: companiesRes.count ?? 0,
      products: productsRes.count ?? 0,
      chemistries: availableChemistriesRes.count ?? 0,
      capacityKl: Number.isFinite(capacityKl) ? capacityKl : 0,
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Internal server error', details: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
