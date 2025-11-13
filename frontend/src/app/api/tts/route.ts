// frontend/src/app/api/tts/route.ts
import { NextResponse } from "next/server";

// 1. Get the API key from server-side environment variables (NOT NEXT_PUBLIC_)
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = "Ix8C14HEHgIQkJswik2o"; // The voice ID you specified

export async function POST(req: Request) {
  if (!ELEVENLABS_API_KEY) {
    return NextResponse.json(
      { error: "TTS service is not configured on the server." },
      { status: 500 }
    );
  }

  try {
    const { text } = await req.json();
    if (!text) {
      return NextResponse.json({ error: "Text is required." }, { status: 400 });
    }

    const elevenLabsUrl = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream`;

    const response = await fetch(elevenLabsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text: text,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("ElevenLabs API Error:", errorBody);
      return NextResponse.json(
        { error: "Failed to generate audio from external service." },
        { status: response.status }
      );
    }

    // 2. Stream the audio response back to your client
    return new NextResponse(response.body, {
      status: 200,
      headers: { "Content-Type": "audio/mpeg" },
    });
  } catch (err: any) {
    console.error("TTS Proxy Error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}