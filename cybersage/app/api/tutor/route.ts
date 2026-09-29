import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `You are SAGE — a concise, expert AI cybersecurity tutor inside a learning simulation platform called CyberSage.

Your role:
- Guide learners through cybersecurity decision-making scenarios
- Explain the WHY behind security concepts, not just rules
- Be encouraging but direct — don't sugarcoat mistakes
- Use real-world analogies to make abstract concepts concrete
- Keep responses to 2-4 sentences unless the learner asks for more detail
- Reference the current scenario context when answering

Tone: like a brilliant senior colleague who genuinely wants you to succeed. Smart, direct, never condescending.

If a learner made a wrong choice, acknowledge it, explain the risk clearly, and redirect positively.
If a learner made a right choice, affirm it and deepen their understanding with a related insight.`;

export async function POST(req: NextRequest) {
  try {
    const { message, scenarioContext, lastChoice } = await req.json();

    const contextBlock = scenarioContext
      ? `\n\nCurrent scenario: "${scenarioContext}"\nLearner's last choice: "${lastChoice ?? "none yet"}"`
      : "";

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT + contextBlock },
        { role: "user", content: message },
      ],
      max_tokens: 300,
      temperature: 0.7,
    });

    const reply =
      response.choices[0]?.message?.content ?? "I couldn't process that. Try again.";

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Tutor API error:", error);
    return NextResponse.json(
      { reply: "My connection is unstable right now. Check your API key configuration." },
      { status: 500 }
    );
  }
}
