import { createClient } from '@vercel/kv';
import { NextResponse } from 'next/server';

// --- 关键修改：手动创建客户端，兼容 Upstash 的变量名 ---
const kv = createClient({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export async function POST(request) {
  try {
    const body = await request.json();
    const { saveId, data } = body;

    if (!saveId || !data) {
      return NextResponse.json({ error: 'Missing data' }, { status: 400 });
    }

    // 存入数据库
    await kv.set(saveId, data, { ex: 60 * 60 * 24 * 30 }); // 30天有效期

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Save Error:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}