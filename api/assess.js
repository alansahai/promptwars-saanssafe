// SaansSafe — Serverless Assessment Endpoint with Ultra-Fast In-Memory Caching

const _openMeteoCache = new Map();
const _narrativeCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ detail: "Method not allowed" });
  }
  res.setHeader("Content-Type", "application/json");

  const body = req.body || {};
  const location = body.location || { name: "Delhi", lat: 28.6519, lon: 77.2315 };
  const profile = body.profile || {
    adults: 2,
    children: 0,
    elderly: 0,
    has_asthma_copd: false,
    has_heart_disease: false,
    is_pregnant: false,
    activity_category: "moderate",
    commute_mode: "metro",
    language: "en",
  };

  const lat = Number(location.lat || 28.6519);
  const lon = Number(location.lon || 77.2315);
  const cacheKey = `${lat.toFixed(2)}_${lon.toFixed(2)}`;

  let aqiData = null;
  let wxData = null;

  // Check Open-Meteo cache
  const cachedMeteo = _openMeteoCache.get(cacheKey);
  if (cachedMeteo && Date.now() - cachedMeteo.ts < CACHE_TTL_MS) {
    aqiData = cachedMeteo.aqiData;
    wxData = cachedMeteo.wxData;
  } else {
    try {
      const [aqRes, wxRes] = await Promise.all([
        fetch(
          `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm10,pm2_5,us_aqi&hourly=pm10,pm2_5,us_aqi&timezone=auto&forecast_days=2`,
          { signal: AbortSignal.timeout(3000) }
        ),
        fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m&hourly=temperature_2m,wind_speed_10m&timezone=auto&forecast_days=2`,
          { signal: AbortSignal.timeout(3000) }
        ),
      ]);
      if (aqRes.ok) aqiData = await aqRes.json();
      if (wxRes.ok) wxData = await wxRes.json();

      if (aqiData && wxData) {
        _openMeteoCache.set(cacheKey, { aqiData, wxData, ts: Date.now() });
      }
    } catch (err) {
      console.warn("Open-Meteo fetch error or timeout, using fallbacks:", err);
    }
  }

  const current_aqi = Number(aqiData?.current?.us_aqi ?? 235.0);
  const current_pm25 = Number(aqiData?.current?.pm2_5 ?? 142.5);
  const current_pm10 = Number(aqiData?.current?.pm10 ?? 250.0);
  const wind_speed = Number(wxData?.current?.wind_speed_10m ?? 4.2);

  const currentHour = new Date().getHours();
  const inversion_flag = wind_speed < 6.0 && (currentHour >= 5 && currentHour <= 10);

  // Vulnerability multiplier
  let vuln = 1.0;
  const reasons = [];

  reasons.push({
    factor: "air_quality_index",
    weight: Math.min(60, Math.round((current_aqi / 300) * 60 * 10) / 10),
    description: `Current AQI is ${Math.round(current_aqi)} with PM2.5 at ${Math.round(current_pm25)} µg/m³.`,
  });

  const numChildren = Number(profile.infants_children ?? profile.children ?? 0);
  const numElderly = Number(profile.elderly ?? 0);

  if (numChildren > 0) {
    vuln += 0.25;
    reasons.push({
      factor: "children_present",
      weight: 15.0,
      description: "Young lungs take 50% more breaths per minute, increasing internal particle dose.",
    });
  }
  if (numElderly > 0) {
    vuln += 0.3;
    reasons.push({
      factor: "elderly_present",
      weight: 18.0,
      description: "Senior members face heightened risk of cardiovascular stress during smog surges.",
    });
  }
  if (profile.has_asthma_copd) {
    vuln += 0.45;
    reasons.push({
      factor: "respiratory_vulnerability",
      weight: 25.0,
      description: "Pre-existing respiratory conditions increase sensitivity to fine aerosol penetration.",
    });
  }
  if (profile.has_heart_disease || profile.has_heart_condition) {
    vuln += 0.35;
    reasons.push({
      factor: "cardiac_vulnerability",
      weight: 20.0,
      description: "Ultrafine PM2.5 crosses into bloodstream, elevating cardiac arterial strain.",
    });
  }
  if (profile.is_pregnant || profile.pregnant) {
    vuln += 0.3;
    reasons.push({
      factor: "pregnancy",
      weight: 18.0,
      description: "Protecting maternal placental barrier from systemic inflammatory aerosol burden.",
    });
  }

  const baseScore = Math.min(60.0, (current_aqi / 300.0) * 60.0);
  const risk_score = Math.max(5.0, Math.min(100.0, Math.round(baseScore * vuln * 10) / 10));

  let risk_level = "Low";
  let risk_color = "#00e400";
  let risk_icon = "🌿";

  if (risk_score > 80) {
    risk_level = "Emergency";
    risk_color = "#7e0023";
    risk_icon = "💀";
  } else if (risk_score > 60) {
    risk_level = "Severe";
    risk_color = "#8f3f97";
    risk_icon = "☣️";
  } else if (risk_score > 40) {
    risk_level = "High";
    risk_color = "#ff7e00";
    risk_icon = "⚠️";
  } else if (risk_score > 20) {
    risk_level = "Moderate";
    risk_color = "#ffff00";
    risk_icon = "😐";
  }

  // Hourly forecast (24 hours)
  const hourlyRawAqi = aqiData?.hourly?.us_aqi || [];
  const hourlyRawPm25 = aqiData?.hourly?.pm2_5 || [];
  const hourly_forecast = [];

  for (let h = 0; h < 24; h++) {
    const a = hourlyRawAqi[h] !== undefined ? Number(hourlyRawAqi[h]) : current_aqi * (1 + 0.15 * Math.sin((h - 6) * 0.26));
    const p = hourlyRawPm25[h] !== undefined ? Number(hourlyRawPm25[h]) : current_pm25 * (1 + 0.15 * Math.sin((h - 6) * 0.26));
    const roundAqi = Math.round(a);
    hourly_forecast.push({
      hour: h,
      aqi: roundAqi,
      pm25: Math.round(p * 10) / 10,
      tag: roundAqi <= 100 ? "safe" : roundAqi <= 150 ? "caution" : "avoid",
    });
  }

  // Timeline tasks
  const timeline_tasks = [
    {
      time: "06:30",
      task: "Morning Inversion Lockdown",
      reason: "Cool ground air traps vehicle particulates. Keep all exterior windows sealed.",
      icon: "🚪",
      priority: 1,
    },
    {
      time: "08:15",
      task: "Commute Shielding (N95 Mandatory)",
      reason: "Peak traffic hours. Wear well-sealed N95 mask; set vehicle ventilation to internal recirculation.",
      icon: "😷",
      priority: 1,
    },
    {
      time: "13:30",
      task: "Optimal Ventilation Window",
      reason: "Solar warming lifts boundary inversion. Brief 15-minute cross-ventilation if indoor air feels stale.",
      icon: "🪟",
      priority: 2,
    },
    {
      time: "18:00",
      task: "Evening Smog Spike Precaution",
      reason: "Atmospheric inversion settles again. Postpone non-essential outdoor children play.",
      icon: "🏡",
      priority: 1,
    },
    {
      time: "21:30",
      task: "Clean Bedroom Micro-climate",
      reason: "Run air purifier on whisper quiet mode near bed headboard to clean 8 hours of breathing zone.",
      icon: "🌙",
      priority: 2,
    },
  ];

  // Indoor hacks
  const indoor_hacks = [
    {
      id: "seal_windows",
      title: "Seal door and window gaps with weatherstripping",
      description: "Foam tape around frames reduces PM2.5 infiltration by 15-20% for under ₹200.",
      cost_tier: "free",
      effort: "easy",
      pm25_reduction_pct: 15.0,
      source_note: "LBNL Infiltration Study; WHO Indoor Air Guidelines",
    },
    {
      id: "wet_mop",
      title: "Damp-mop floors instead of sweeping",
      description: "Dry brooms re-suspend settled fine dust into breathing height. Wet microfibre captures 90% of floor particles.",
      cost_tier: "free",
      effort: "easy",
      pm25_reduction_pct: 12.0,
      source_note: "US EPA Particulate Guide",
    },
    {
      id: "hepa_purifier",
      title: "Run HEPA air purifier in closed bedroom",
      description: "True HEPA filtration removes 99.97% of fine particles down to 0.3 microns.",
      cost_tier: "medium",
      effort: "easy",
      pm25_reduction_pct: 85.0,
      source_note: "US EPA / CPCB Standards",
    },
    {
      id: "n95_mask",
      title: "Wear N95/FFP2 for essential outdoor travel",
      description: "Cloth masks leak 70% of PM2.5 around borders. A snug N95 cuts personal inhaled dose by over 90%.",
      cost_tier: "low",
      effort: "easy",
      pm25_reduction_pct: 90.0,
      source_note: "Langrish et al., Circulation (2012)",
    },
  ];

  // Sustainable alternatives
  const sustainable_alternatives = [
    {
      id: "car_to_metro",
      title: "Swap single-occupancy car commute for Metro",
      description: "Metro emits 25 gCO2e/km vs 192 gCO2e/km for car, while filtered AC train cars slash personal PM2.5 exposure by 40%.",
      from_modes: ["car"],
      to_mode: "metro",
      exposure_change_pct: -40.0,
      emission_change_gco2e_per_km: -167.0,
      community_note: "Removes 420 kg of carbon emissions annually for typical 15km daily commute.",
      effort: "medium",
    },
    {
      id: "scooter_to_bus",
      title: "Shift two-wheeler commute to electric or CNG bus",
      description: "Cuts direct tailpipe inhalation in heavy traffic jams by 35%.",
      from_modes: ["two_wheeler"],
      to_mode: "bus",
      exposure_change_pct: -35.0,
      emission_change_gco2e_per_km: -20.0,
      community_note: "Reduces congestion and local ground-level soot concentration.",
      effort: "medium",
    },
  ];

  // Language-tailored rule narrative defaults
  const isHi = profile.language === "hi";
  const isTa = profile.language === "ta";

  let narrative = {
    headline: isHi
      ? `स्मॉग चेतावनी: ${location.name} में आज पारिवारिक सुरक्षा आवश्यक`
      : isTa
      ? `காற்று எச்சரிக்கை: ${location.name} இல் குடும்ப பாதுகாப்பு தேவை`
      : `Smog Alert: ${location.name} Air Quality Requires Family Protection Today`,
    summary: isHi
      ? `वर्तमान AQI ${Math.round(current_aqi)} (${risk_level} जोखिम) है। हवा में सूक्ष्म PM2.5 कण अत्यधिक हैं और तापमान उलटाव से धुआं जमीन पर केंद्रित है।`
      : isTa
      ? `தற்போதைய AQI ${Math.round(current_aqi)} (${risk_level} ஆபத்து). வெளியில் நச்சு PM2.5 துகள்கள் அதிகம், நிலப்பரப்பில் புகை தேங்கியுள்ளது.`
      : `With current AQI at ${Math.round(current_aqi)} (${risk_level} Risk), outdoor air contains elevated levels of microscopic PM2.5 particles. Ground inversion conditions mean pollution remains concentrated near ground level.`,
    family_tips: isHi
      ? [
          "सुबह 6:00 से 10:00 बजे के बीच बाहरी दरवाजे और खिड़कियां बंद रखें।",
          "घर के मुख्य कमरों में एयर प्यूरीफायर चलाएं।",
          "बाहर निकलते समय N95 या FFP2 मास्क अवश्य पहनें।",
        ]
      : isTa
      ? [
          "காலை 6:00 முதல் 10:00 வரை சாளரங்களை மூடி வைக்கவும்.",
          "அறைகளில் காற்று சுத்திகரிப்பானை இயக்கவும்.",
          "வெளியே செல்லும்போது N95 முகக்கவசம் அணியவும்.",
        ]
      : [
          "Keep all doors and windows tightly closed between 6:00 AM and 10:00 AM.",
          "Run indoor air purifiers in occupied living rooms and bedrooms.",
          "Ensure all family members wear snug N95/FFP2 masks if stepping out.",
        ],
    kid_and_elder_notes: isHi
      ? [
          "बच्चे: सुबह के आउटडोर खेलों को स्थगित करें और घर के अंदर खेलें।",
          "बुजुर्ग: रक्तचाप की निगरानी करें और आवश्यक दवाएं पास रखें।",
        ]
      : isTa
      ? [
          "குழந்தைகள்: காலை நேர வெளிப்புற விளையாட்டுகளை தவிர்க்கவும்.",
          "முதியவர்கள்: இரத்த அழுத்தத்தைக் கண்காணித்து மருந்துகளை அருகில் வைக்கவும்.",
        ]
      : [
          "Children: Postpone outdoor morning sports; substitute with indoor active games.",
          "Elderly: Monitor blood pressure and keep prescribed inhalers easily accessible.",
        ],
    motivational_nudge: isHi
      ? "खिड़कियां सील करने और सुरक्षित समय पर आवागमन जैसे छोटे बदलाव आज फेफड़ों की रक्षा करते हैं।"
      : isTa
      ? "சாளரங்களை அடைப்பது மற்றும் பயண முறையை மாற்றுவது போன்ற சிறு பழக்கங்கள் உங்கள் குடும்பத்தை பாதுகாக்கும்."
      : "Small daily routine adjustments like sealing window seams and swapping commute modes protect your lungs today and build a healthier community tomorrow.",
  };

  let ai_generated = false;
  const narrativeKey = `${cacheKey}_${profile.language || "en"}_${Math.round(risk_score / 5) * 5}`;
  const cachedNarrative = _narrativeCache.get(narrativeKey);

  if (cachedNarrative && Date.now() - cachedNarrative.ts < CACHE_TTL_MS) {
    narrative = cachedNarrative.narrative;
    ai_generated = true;
  } else {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      try {
        const prompt = `You are SaansSafe, a warm, scientifically grounded air quality assistant for families in India.
Generate a structured family smog navigation narrative in ${isHi ? "Hindi (हिन्दी)" : isTa ? "Tamil (தமிழ்)" : "English"}.
Use ONLY the following factual context:
- Location: ${location.name}
- Current AQI: ${Math.round(current_aqi)}
- PM2.5: ${Math.round(current_pm25)} µg/m³
- Risk Level: ${risk_level} (Score ${risk_score}/100)
- Inversion Flag: ${inversion_flag}
- Profile: ${JSON.stringify(profile)}

Return a strict JSON object with these keys:
{
  "headline": "concise headline mentioning location and smog advice",
  "summary": "2-3 sentences explaining air conditions and what they mean for this family",
  "family_tips": ["tip 1", "tip 2", "tip 3"],
  "kid_and_elder_notes": ["note 1", "note 2"],
  "motivational_nudge": "inspiring, positive closing thought"
}`;

        // Set maxOutputTokens to 600, thinkingBudget to 0, and a 3.5s timeout for blazingly fast response
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(3500),
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 600,
                responseMimeType: "application/json",
                thinkingConfig: {
                  thinkingBudget: 0,
                },
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
              _narrativeCache.set(narrativeKey, { narrative, ts: Date.now() });
            }
          }
        }
      } catch (err) {
        console.warn("Gemini assessment call failed or timed out, using instant rule narrative:", err);
      }
    }
  }

  return res.status(200).json({
    ai_generated,
    risk_score,
    risk_level,
    risk_color,
    risk_icon,
    risk_reasons: reasons,
    current_aqi: Math.round(current_aqi),
    current_pm25: Math.round(current_pm25 * 10) / 10,
    current_pm10: Math.round(current_pm10 * 10) / 10,
    inversion_flag,
    headline: narrative.headline,
    summary: narrative.summary,
    family_tips: narrative.family_tips,
    kid_and_elder_notes: narrative.kid_and_elder_notes,
    motivational_nudge: narrative.motivational_nudge,
    hourly_forecast,
    timeline_tasks,
    indoor_hacks,
    sustainable_alternatives,
  });
}
