import Anthropic from '@anthropic-ai/sdk';
import { NextRequest } from 'next/server';

const client = new Anthropic();

const SYSTEM_PROMPT = `You are creating a minimal SVG overlay that helps a student SEE a mnemonic association in an abstract TMS figure.

You receive the figure image AND a German explanation. The explanation has TWO sentences:
- Sentence 1 names which existing figure lines already form the base shape of the object — DO NOT redraw those.
- Sentence 2 names exactly which features must be ADDED in yellow so the object becomes recognizable — these are what you draw.

Your job: add 2 to 5 simple yellow strokes ON TOP of the figure that match sentence 2 precisely. The figure's own lines stay completely untouched — you only ADD a few strokes.

Strict rules:
- Coordinate space is 0-100 (the SVG is rendered with viewBox "0 0 100 100" stretched over the figure)
- Use ONLY these elements: path, line, circle, ellipse, polyline, polygon
- Every element MUST carry: stroke="#facc15" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
- 2 to 5 strokes only — exactly the additions sentence 2 lists, no more
- Place strokes EXACTLY where they belong on the actual figure (e.g. if sentence 2 says "Schnabel oben links", put a small triangle stroke in the upper-left of the figure where the existing edge ends)
- Never re-trace the figure itself; the original lines carry the base shape

Respond with ONLY the inner SVG elements (no <svg> wrapper, no XML declaration, no comments, no markdown code fences). Example:
<path d="M 20 30 L 50 10 L 80 30" stroke="#facc15" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
<circle cx="50" cy="50" r="3" stroke="#facc15" fill="none" stroke-width="2.5" />`;

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'ANTHROPIC_API_KEY nicht konfiguriert' }, { status: 500 });
  }

  let body: {
    imageBase64: string;
    mediaType: string;
    associationName: string;
    associationExplanation?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Ungültige Anfrage' }, { status: 400 });
  }

  const { imageBase64, mediaType, associationName, associationExplanation } = body;
  if (!imageBase64 || !mediaType || !associationName) {
    return Response.json({ error: 'Parameter fehlen' }, { status: 400 });
  }

  const validMediaTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!validMediaTypes.includes(mediaType)) {
    return Response.json({ error: 'Ungültiger Bildtyp' }, { status: 400 });
  }

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: `Assoziation: "${associationName}"

Erklärung des Mnemotechnikers (Satz 1 = bereits vorhandene Grundform, Satz 2 = was du in Gelb ergänzen sollst):
${associationExplanation ?? ''}

Zeichne genau die in Satz 2 genannten Ergänzungen mit 2-5 gelben Strichen an die richtige Stelle der Figur.`,
            },
          ],
        },
      ],
    });

    const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    const svg = raw
      .replace(/^```(?:svg|xml|html)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    return Response.json({ svg });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
    return Response.json({ error: `Claude API Fehler: ${message}` }, { status: 500 });
  }
}
