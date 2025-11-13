import { NextRequest, NextResponse } from 'next/server';

function corsHeaders() {
	return {
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'POST,OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type',
		'Cache-Control': 'no-store',
	};
}

export async function OPTIONS() {
	return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: NextRequest) {
	try {
		let body: any = null;
		let raw = '';
		try {
			body = await req.json();
		} catch {
			try {
				raw = await req.text();
				body = raw ? JSON.parse(raw) : null;
			} catch {
				body = { raw };
			}
		}

		const ua = req.headers.get('user-agent') || '';
		const referer = req.headers.get('referer') || '';
		const origin = req.headers.get('origin') || '';
		const xff = req.headers.get('x-forwarded-for') || '';

		const event = body?.event || 'unknown';
		const shop = body?.shop || '';
		const productId = body?.productId || '';
		const productGid = body?.productGid || '';
		const productHandle = body?.productHandle || '';
		const productTitle = body?.productTitle || '';
		const images = Array.isArray(body?.images) ? body.images : [];

		console.log('🔎 [SIF DEBUG] Shopify context received', {
			event,
			shop,
			productId,
			productGid,
			productHandle,
			productTitle,
			imagesCount: images.length,
			firstImages: images.slice(0, 3).map((i: any) => (typeof i === 'string' ? i : i?.src || '')),
			originHint: origin,
			referer,
			ua,
			xff,
		});

		return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders() });
	} catch (e: any) {
		return NextResponse.json({ ok: false, error: e?.message || 'debug_error' }, { status: 500, headers: corsHeaders() });
	}
}


