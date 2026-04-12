import { NextResponse } from "next/server";
import { createAgentUIStreamResponse } from "ai";
import { z } from "zod";
import { requireAdminAuth } from "@/lib/admin/api-auth";
import { finalizationCopilotAgent } from "@/lib/agents/finalization-copilot-agent";
import { finalizationCopilotContextSchema } from "@/lib/pipeline/finalization-draft";

export const maxDuration = 30;

const finalizationCopilotRequestSchema = z.object({
  messages: z.array(z.unknown()),
  context: finalizationCopilotContextSchema,
});

export async function POST(request: Request) {
  const auth = await requireAdminAuth();
  if (!auth.authorized) return auth.response;

  try {
    const payload = finalizationCopilotRequestSchema.parse(await request.json());

    return await createAgentUIStreamResponse({
      agent: finalizationCopilotAgent,
      uiMessages: payload.messages,
      options: payload.context,
    });
  } catch (error) {
    console.error("Failed to start finalization copilot:", error);

    return NextResponse.json(
      { error: "Invalid finalization copilot request" },
      { status: 400 },
    );
  }
}
