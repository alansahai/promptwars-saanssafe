/**
 * SaansSafe — GenAI Narrative Synthesis Engine
 * Powered by Google Gemini 2.5 Flash with structured JSON schemas and localized fallbacks.
 * @module api/_lib/gemini
 */

const _narrativeCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * @typedef {Object} NarrativeResult
 * @property {string} headline - Concise warning/guidance headline
 * @property {string} summary - 2-sentence executive summary
 * @property {string[]} family_tips - Actionable protective steps
 * @property {string[]} kid_and_elder_notes - Guidance for vulnerable cohorts
 * @property {string} motivational_nudge - Uplifting behavioral encouragement
 */

/**
 * Build deterministic localized fallback narrative.
 *
 * @param {string} locationName
 * @param {number} current_aqi
 * @param {string} risk_level
 * @param {boolean} inversion_flag
 * @param {string} language
 * @returns {NarrativeResult}
 */
export function getLocalFallbackNarrative(locationName, current_aqi, risk_level, inversion_flag, language) {
  const isHi = language === "hi";
  const isTa = language === "ta";

  return {
    headline: isHi
      ? `${locationName} वायु गुणवत्ता: ${risk_level} जोखिम (AQI ${Math.round(current_aqi)})`
      : isTa
      ? `${locationName} காற்று தரம்: ${risk_level} ஆபத்து (AQI ${Math.round(current_aqi)})`
      : `${locationName} Air Quality Alert: ${risk_level} Risk (AQI ${Math.round(current_aqi)})`,
    summary: isHi
      ? `वर्तमान वायु गुणवत्ता सूचकांक ${Math.round(current_aqi)} (${risk_level}) पर है। सूक्ष्म PM2.5 कण श्वसन तंत्र के लिए हानिकारक हैं।`
      : isTa
      ? `தற்போதைய காற்றுத் தரம் ${Math.round(current_aqi)} (${risk_level}) ஆக உள்ளது. நுண் துகள்கள் உங்கள் குடும்பத்தின் சுவாச நலனை பாதிக்கலாம்.`
      : `Current AQI is at ${Math.round(current_aqi)} (${risk_level} Risk). Elevated PM2.5 requires proactive protective measures today.`,
    family_tips: isHi
      ? [
          "सुबह 6-9 बजे बाहरी खिड़कियां बंद रखें जब स्मॉग जमीन के पास होता है।",
          "बाहर निकलते समय N95 या FFP2 मास्क का अनिवार्य उपयोग करें।",
          "घर में गीला पोछा लगाएं, सूखी झाड़ू लगाने से धूल उड़ती है।",
        ]
      : isTa
      ? [
          "காலை வேளையில் வெளிப்புற காற்று உள்ளே நுழையாதவாறு கதவு ஜன்னல்களை மூடி வைக்கவும்.",
          "வெளியே செல்லும்போது N95 முகக்கவசம் அணியவும்.",
          "ஈர துணியால் தரையை துடைக்கவும், உலர்ந்த துடைப்பம் தூசியை கிளப்பும்.",
        ]
      : [
          "Seal exterior windows during early morning ground-inversion peaks.",
          "Equip family members with well-sealed N95 masks for outdoor commutes.",
          "Prefer damp-mopping over dry sweeping to prevent particle re-suspension.",
        ],
    kid_and_elder_notes: isHi
      ? [
          "बच्चे: बाहरी खेल दोपहर 12 बजे से 2 बजे के बीच ही सीमित रखें।",
          "बुजुर्ग: सुबह की सैर स्थगित करें और श्वसन दवाएं पास रखें।",
        ]
      : isTa
      ? [
          "குழந்தைகள்: கடுமையான வெளிப்புற விளையாட்டுகளை தவிர்க்கவும்.",
          "முதியவர்கள்: காலை நேர நடைப்பயிற்சியை தவிர்க்கவும்.",
        ]
      : [
          "Children: Restrict vigorous outdoor exertion to midday solar hours.",
          "Elderly: Monitor blood pressure and keep prescribed inhalers easily accessible.",
        ],
    motivational_nudge: isHi
      ? "खिड़कियां सील करने और सुरक्षित आवागमन जैसे छोटे बदलाव आज फेफड़ों की रक्षा करते हैं।"
      : isTa
      ? "சாளரங்களை அடைப்பது மற்றும் பயண முறையை மாற்றுவது உங்கள் குடும்பத்தை பாதுகாக்கும்."
      : "Small daily routine adjustments like sealing window seams and swapping commute modes protect your lungs today.",
  };
}

/**
 * Synthesize personalized narrative with Gemini 2.5 Flash, falling back to deterministic templates.
 *
 * @param {Object} location
 * @param {number} current_aqi
 * @param {number} current_pm25
 * @param {string} risk_level
 * @param {number} risk_score
 * @param {boolean} inversion_flag
 * @param {Object} profile
 * @returns {Promise<{ narrative: NarrativeResult, ai_generated: boolean }>}
 */
export async function generateNarrative(location, current_aqi, current_pm25, risk_level, risk_score, inversion_flag, profile) {
  const cacheKey = `${Number(location.lat || 28.65).toFixed(2)}_${Number(location.lon || 77.23).toFixed(2)}_${profile.language || "en"}_${Math.round(risk_score / 5) * 5}`;
  const cached = _narrativeCache.get(cacheKey);

  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return { narrative: cached.narrative, ai_generated: true };
  }

  let narrative = getLocalFallbackNarrative(
    location.name || "Delhi",
    current_aqi,
    risk_level,
    inversion_flag,
    profile.language || "en"
  );
  let ai_generated = false;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { narrative, ai_generated };
  }

  const isHi = profile.language === "hi";
  const isTa = profile.language === "ta";

  try {
    const prompt = `You are SaansSafe, a warm, scientifically grounded air quality assistant for families in India.
Generate a structured family smog navigation narrative in ${isHi ? "Hindi (हिन्दी)" : isTa ? "Tamil (தமிழ்)" : "English"}.
Use ONLY the following factual context:
- Location: ${location.name || "Delhi"}
- Current AQI: ${Math.round(current_aqi)}
- PM2.5: ${Math.round(current_pm25)} µg/m³
- Risk Level: ${risk_level} (Score ${risk_score}/100)
- Inversion Flag: ${inversion_flag}
- Profile: ${JSON.stringify(profile)}

Return a strict JSON object with these keys:
{
  "headline": "concise headline mentioning location and smog advice",
  "summary": "2 sentences explaining air conditions and immediate household health priority",
  "family_tips": ["tip 1", "tip 2", "tip 3"],
  "kid_and_elder_notes": ["vital protective note for kids/elders"],
  "motivational_nudge": "inspiring, positive closing thought"
}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(2500),
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 350,
            responseMimeType: "application/json",
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    );

    if (response.ok) {
      const data = await response.json();
      const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawJson) {
        const parsed = JSON.parse(rawJson);
        if (parsed.headline && parsed.summary && Array.isArray(parsed.family_tips)) {
          narrative = parsed;
          ai_generated = true;
          _narrativeCache.set(cacheKey, { narrative, ts: Date.now() });
        }
      }
    }
  } catch (err) {
    console.warn("Gemini call timed out or failed, using local deterministic fallback:", err);
  }

  return { narrative, ai_generated };
}
