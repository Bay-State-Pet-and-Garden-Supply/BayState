import { NextRequest, NextResponse } from "next/server";
import { createAgentUIStreamResponse } from "ai";
import { z } from "zod";
import { requireAdminAuth } from "@/lib/admin/api-auth";
import { finalizationCopilotAgent } from "@/lib/agents/reviewing-copilot-agent";
import { finalizationCopilotContextSchema } from "@/lib/pipeline/reviewing-copilot-workspace";

export const maxDuration = 30;

const finalizationCopilotRequestSchema = z.object({
  messages: z.array(z.unknown()),
  context: finalizationCopilotContextSchema,
});

export async function POST(request: NextRequest) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  try {
    const payload = finalizationCopilotRequestSchema.parse(await request.json());

    return await createAgentUIStreamResponse({
      agent: finalizationCopilotAgent,
      uiMessages: payload.messages,
      options: payload.context,
    });
  } catch (error) {
    console.error("Failed to start reviewing copilot:", error);

    return NextResponse.json(
      { error: "Invalid reviewing copilot request" },
      { status: 400 },
    );
  }
}
