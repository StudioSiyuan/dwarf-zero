import { kv } from '@vercel/kv';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const { saveId, data } = body;

    if (!saveId || !data) {
      return NextResponse.json({ error: 'Missing data' }, { status: 400 });
    }

    // 把存档存入 Redis，有效期 30 天 (你可以去掉 ex 让他永久保存)
    await kv.set(saveId, data, { ex: 60 * 60 * 24 * 30 });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}