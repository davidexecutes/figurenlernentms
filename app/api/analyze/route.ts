import Anthropic from '@anthropic-ai/sdk';
import { NextRequest } from 'next/server';

const client = new Anthropic();

const SYSTEM_PROMPT = `Du bist ein Mnemotechnik-Experte für TMS Figuren. Schaue dir die abstrakte geometrische Figur an und erfinde EINE einzige, besonders einprägsame Assoziation (Tier, Gegenstand, Gesicht, Buchstabe oder Symbol).

WICHTIG zum Verständnis: Die Figur allein ist fast nie schon das Objekt — sie wird es erst durch ein paar gelbe Striche, die im nächsten Schritt von einem Tool über die Figur gezeichnet werden. Wähle deshalb eine Assoziation, bei der nur wenige Ergänzungen nötig sind, damit das Objekt erkennbar wird.

Pflichtfelder:
1. "name": Die Assoziation auf Deutsch (kurz und prägnant, z.B. "Vogel", "Bügeleisen", "schlafendes Gesicht")
2. "explanation": Genau zwei kurze Sätze auf Deutsch:
   - Satz 1: WELCHE Linien/Bereiche der Figur die Grundform des Objekts bereits tragen (z.B. "Der geschwungene Bogen oben bildet den Rücken des Vogels.")
   - Satz 2: WAS die gelben Striche ergänzen, damit das Objekt erkennbar wird (z.B. "Die gelben Striche ergänzen den spitzen Schnabel, ein kleines Auge und eine Schwanzfeder.")
3. "memorability": Zahl 1-5, wie einprägsam diese Assoziation ist
4. "highlight": einer der Werte "top-left", "top-right", "bottom-left", "bottom-right", "center", "top", "bottom", "left", "right", "full"

Antworte NUR mit JSON in genau diesem Format:
{
  "association": {
    "name": "...",
    "explanation": "Satz 1. Satz 2.",
    "memorability": 4,
    "highlight": "center"
  }
}`;

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'ANTHROPIC_API_KEY nicht konfiguriert' }, { status: 500 });
  }

  let body: { imageBase64: string; mediaType: string; excludeNames?: string[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Ungültige Anfrage' }, { status: 400 });
  }

  const { imageBase64, mediaType, excludeNames } = body;
  if (!imageBase64 || !mediaType) {
    return Response.json({ error: 'Bild fehlt' }, { status: 400 });
  }

  const validMediaTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!validMediaTypes.includes(mediaType)) {
    return Response.json({ error: 'Ungültiger Bildtyp' }, { status: 400 });
  }

  const exclusion =
    excludeNames && excludeNames.length > 0
      ? `\n\nDiese Assoziationen wurden bereits gezeigt — gib eine ANDERE, deutlich verschiedene Idee:\n- ${excludeNames.join('\n- ')}`
      : '';

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
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
              text: `Analysiere diese TMS-Figur und gib mir EINE einprägsame Assoziation.${exclusion}`,
            },
          ],
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json({ error: 'Antwort konnte nicht verarbeitet werden' }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    let association = parsed.association;
    if (!association && Array.isArray(parsed.associations) && parsed.associations.length > 0) {
      association = [...parsed.associations].sort(
        (a, b) => (b.memorability ?? 0) - (a.memorability ?? 0)
      )[0];
    }

    if (!association || !association.name) {
      return Response.json({ error: 'Keine Assoziation erhalten' }, { status: 500 });
    }

    return Response.json({ association });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
    return Response.json({ error: `Claude API Fehler: ${message}` }, { status: 500 });
  }
}
