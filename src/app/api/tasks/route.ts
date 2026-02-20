import { NextResponse } from "next/server";
import { taskManager } from "@/lib/task-manager";

export async function GET() {
    return NextResponse.json(taskManager.getAllTasks());
}

export async function DELETE() {
    // Logic to clear finished tasks could go here
    return NextResponse.json({ success: true });
}
