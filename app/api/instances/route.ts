import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabaseServer';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get('account_id');
    if (!accountId) {
      return NextResponse.json({ error: 'Missing account_id' }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from('instances' as any)
      .select('id, name, created_at, account_id')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });
    if (error) throw error;

    return NextResponse.json({ instances: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to fetch instances' }, { status: 500 });
  }
}


