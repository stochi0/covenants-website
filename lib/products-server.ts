import { supabaseServer } from '@/lib/supabase-server'
import type {
  PaginatedResponse,
  Product,
  ProductCategoryFacet,
  SearchParams,
} from '@/lib/products-data'

const PRODUCT_CATEGORY_ORDER = ['api', 'intermediate', 'chemical', 'impurity']

interface DbProduct {
  id: string
  product_name: string | null
  cas_number: string | null
  category: string | null
}

function mapProduct(row: DbProduct): Product {
  return {
    id: row.id,
    name: row.product_name ?? 'Unnamed product',
    casNumber: row.cas_number ?? 'N/A',
    category: row.category,
    supplierMatches: [],
    supplierCount: 0,
    facilityCount: 0,
  }
}

export async function fetchProductCategoryFacets(): Promise<ProductCategoryFacet[]> {
  const { data, error } = await supabaseServer
    .from('products')
    .select('category')
    .is('deleted_at', null)
    .not('category', 'is', null)

  if (error) throw error

  const countByCategory = new Map<string, number>()
  for (const row of (data ?? []) as Array<{ category: string | null }>) {
    if (!row.category) continue
    countByCategory.set(row.category, (countByCategory.get(row.category) ?? 0) + 1)
  }

  const ordered = PRODUCT_CATEGORY_ORDER
    .map((category) => ({ value: category, count: countByCategory.get(category) ?? 0 }))

  const extras = Array.from(countByCategory.entries())
    .filter(([category]) => !PRODUCT_CATEGORY_ORDER.includes(category))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([value, count]) => ({ value, count }))

  return [...ordered, ...extras]
}

export async function searchProducts(params: SearchParams): Promise<PaginatedResponse> {
  const query = params.query.trim()
  const page = Math.max(params.page, 1)
  const pageSize = Math.min(Math.max(params.pageSize, 1), 100)
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let request = supabaseServer
    .from('products')
    .select('id, product_name, cas_number, category', { count: 'exact' })
    .is('deleted_at', null)

  if (params.categories.length > 0) {
    request = request.in('category', params.categories)
  }

  if (query) {
    request = params.searchType === 'cas'
      ? request.ilike('cas_number', `%${query}%`)
      : request.ilike('product_name', `%${query}%`)
  }

  request = params.searchType === 'cas'
    ? request.order('cas_number', { ascending: true, nullsFirst: false }).order('product_name', { ascending: true, nullsFirst: false })
    : request.order('product_name', { ascending: true, nullsFirst: false }).order('cas_number', { ascending: true, nullsFirst: false })

  const { data, error, count } = await request.range(from, to)
  if (error) throw error

  const rows = (data ?? []) as DbProduct[]
  const searchTerm = query.toLowerCase()
  const products = rows.map((row) => mapProduct(row))
  const sortedProducts = searchTerm
    ? [...products].sort((a, b) => {
        const aSource = params.searchType === 'cas' ? a.casNumber : a.name
        const bSource = params.searchType === 'cas' ? b.casNumber : b.name
        const aLower = aSource.toLowerCase()
        const bLower = bSource.toLowerCase()
        const aExact = aLower === searchTerm
        const bExact = bLower === searchTerm
        if (aExact !== bExact) return aExact ? -1 : 1
        const aStarts = aLower.startsWith(searchTerm)
        const bStarts = bLower.startsWith(searchTerm)
        if (aStarts !== bStarts) return aStarts ? -1 : 1
        return a.name.localeCompare(b.name)
      })
    : products
  const total = count ?? 0

  return {
    products: sortedProducts,
    total,
    page,
    pageSize,
    hasMore: to < total - 1,
  }
}

export async function getProductById(id: string): Promise<Product | null> {
  const { data, error } = await supabaseServer
    .from('products')
    .select('id, product_name, cas_number, category')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  return mapProduct(data as DbProduct)
}

export async function getProductsByIds(ids: string[]): Promise<Product[]> {
  if (ids.length === 0) return []

  const { data, error } = await supabaseServer
    .from('products')
    .select('id, product_name, cas_number, category')
    .in('id', ids)
    .is('deleted_at', null)

  if (error) throw error

  const rows = (data ?? []) as DbProduct[]
  return rows.map((row) => mapProduct(row))
}
