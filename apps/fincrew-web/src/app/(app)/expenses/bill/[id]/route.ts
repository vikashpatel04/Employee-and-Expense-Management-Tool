import { createClient } from '@/lib/supabase/server';

/**
 * GET /expenses/bill/<expense id> → a one-minute signed link to its bill photo. RLS decides:
 * only someone who can see the expense gets its path, and Storage checks again.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: row } = await supabase
    .from('expenses')
    .select('bill_path')
    .eq('id', id)
    .maybeSingle();
  if (!row?.bill_path) return new Response('Not found', { status: 404 });
  const { data, error } = await supabase.storage.from('bills').createSignedUrl(row.bill_path, 60);
  if (error || !data) return new Response('Not found', { status: 404 });
  return Response.redirect(data.signedUrl, 302);
}
