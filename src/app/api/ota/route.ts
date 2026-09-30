import { NextResponse } from "next/server";
import manifest from "../../../../public/ota/manifest.json";

// The manifest is compiled into this route. A production rebuild is what publishes a new phone bundle.

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const runtime = request.headers.get("expo-runtime-version");
  if (runtime && runtime !== manifest.runtimeVersion) {
    return new NextResponse(null, { status: 404 });
  }
  const current = request.headers.get("expo-current-update-id");
  if (current && current.toLowerCase() === manifest.id.toLowerCase()) {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "expo-protocol-version": "1",
        "expo-sfv-version": "0",
        "cache-control": "private, max-age=0",
      },
    });
  }
  return new NextResponse(JSON.stringify(manifest), {
    headers: {
      "content-type": "application/expo+json",
      "expo-protocol-version": "1",
      "expo-sfv-version": "0",
      "cache-control": "private, max-age=0",
    },
  });
}
