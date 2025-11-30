import { kv } from '@vercel/kv';
import { NextResponse } from 'next/server';

export async function GET(request) {
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
}