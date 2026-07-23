import { NextRequest, NextResponse } from 'next/server';

export async function proxyMedia(request: NextRequest, defaultMimeType: string, label: string) {
  const url = request.nextUrl.searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: `Missing url parameter` }, { status: 400 });
  }

  try {
    const response = await fetch(url);

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch ${label}: ${response.statusText}` },
        { status: response.status }
      );
    }

    const blob = await response.blob();
    return new NextResponse(blob, {
      headers: {
        'Content-Type': response.headers.get('Content-Type') || defaultMimeType,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return NextResponse.json(
      { error: `Failed to proxy ${label}` },
      { status: 500 }
    );
  }
}
