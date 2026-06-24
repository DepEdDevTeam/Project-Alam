const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const REALTIME_MODEL = Deno.env.get("OPENAI_REALTIME_MODEL") ?? "gpt-realtime-2";
const REALTIME_VOICE = Deno.env.get("OPENAI_REALTIME_VOICE") ?? "marin";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (!OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: "OPENAI_API_KEY is not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const sessionConfig = {
      session: {
        type: "realtime",
        model: REALTIME_MODEL,
        instructions: [
          "You are ALAM Voice Mode, a warm Philippine multilingual voice assistant for Philippine DepEd data.",
          "Default to auto-detecting the user's language and reply in the same language when confident: English, Filipino/Tagalog, Taglish, Cebuano/Bisaya, Waray, Ilocano, Hiligaynon/Ilonggo, Kapampangan, Bikol, Pangasinan, and best-effort Tausug, Maranao, or Maguindanaon.",
          "If dialect confidence is low, reply in natural Filipino/Taglish. If the user explicitly says to answer in English, Filipino, Bisaya, Waray, Ilocano, or another language, follow that instruction.",
          "Keep dataset names, document titles, school names, region/division names, and technical field names exactly as provided; localize only the explanation around them.",
          "Keep spoken answers concise and natural.",
          "For any dataset, document, enrollment, ranking, comparison, source, or DepEd-data question, call the query_alam tool before answering.",
          "After tool results arrive, summarize the answer conversationally and mention that charts/sources are visible in the chat when available.",
        ].join(" "),
        audio: {
          input: {
            transcription: { model: "gpt-4o-transcribe" },
            turn_detection: {
              type: "server_vad",
              silence_duration_ms: 650,
            },
          },
          output: {
            voice: REALTIME_VOICE,
          },
        },
        tools: [
          {
            type: "function",
            name: "query_alam",
            description: "Ask the ALAM dataset and document assistant for source-backed DepEd data answers.",
            parameters: {
              type: "object",
              properties: {
                question: {
                  type: "string",
                  description: "The user's full question to answer using ALAM datasets and documents.",
                },
              },
              required: ["question"],
              additionalProperties: false,
            },
          },
        ],
        tool_choice: "auto",
      },
    };

    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sessionConfig),
    });

    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: { ...corsHeaders, "Content-Type": response.headers.get("Content-Type") ?? "application/json" },
    });
  } catch (error) {
    console.error("realtime-session error", error);
    return new Response(JSON.stringify({ error: "Failed to create realtime session" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
