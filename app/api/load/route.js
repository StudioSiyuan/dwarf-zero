import { createClient } from '@vercel/kv';
import { NextResponse } from 'next/server';

// --- 关键修改：兼容 Upstash 变量名 ---
const kv = createClient({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const saveId = searchParams.get('id');

    if (!saveId) {
      return NextResponse.json({ error: 'Missing Save ID' }, { status: 400 });
    }

    const data = await kv.get(saveId);

    if (!data) {
      return NextResponse.json({ error: 'Save not found' }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Load Error:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}