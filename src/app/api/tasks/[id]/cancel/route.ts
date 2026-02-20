import { NextRequest, NextResponse } from "next/server";
import { taskManager } from "@/lib/task-manager";

export async function POST(req: NextRequest, { params }: { params: any }) {
    const { id } = await params;
    console.log(`Petición de cancelación para tarea: ${id}`);
    taskManager.cancelTask(id);
    return NextResponse.json({ success: true });
}
