import { NextRequest, NextResponse } from "next/server";
import { M365Importer } from "@/lib/importer";
import { getStorage } from "@/lib/storage";
import { taskManager } from "@/lib/task-manager";
import path from "path";

export async function POST(req: NextRequest) {
    const body = await req.json();
    const { item, targetId, destinationConfig, settings, storageConfig } = body;

    const task = taskManager.createTask('import', { item, targetId });
    const abortController = new AbortController();
    taskManager.registerAbortController(task.id, abortController);

    // Background process
    (async () => {
        try {
            const storage = getStorage(storageConfig);
            const importer = new M365Importer(storageConfig);
            await importer.initialize(destinationConfig);

            taskManager.addLog(task.id, `🚀 Iniciando importación de ${item.name} hacia ${targetId}...`);

            const contentRelPath = item.path;
            const statusFileRelPath = path.join(contentRelPath, '.import_status.json');

            await storage.writeFile(statusFileRelPath, JSON.stringify({ status: 'running', startTime: new Date() }));

            taskManager.addLog(task.id, 'Calculando elementos totales...');
            await importer.scanTotals(contentRelPath, item.type);

            if (item.type === 'user') {
                await importer.importUser(contentRelPath, targetId, (p) => {
                    taskManager.addLog(task.id, p.message);

                    // Always update progress with latest stats
                    taskManager.setProgress(task.id, 0.5, {
                        itemId: p.itemId || targetId,
                        itemType: 'user',
                        label: p.label || p.message,
                        stats: importer.getStats()
                    });
                }, settings, abortController.signal);
            } else {
                await importer.importSite(contentRelPath, targetId, (p) => {
                    taskManager.addLog(task.id, p.message);
                    taskManager.setProgress(task.id, 0.5, {
                        itemId: p.itemId || targetId,
                        itemType: 'site',
                        label: p.label || p.message,
                        stats: importer.getStats()
                    });
                }, abortController.signal);
            }

            if (abortController.signal.aborted) {
                taskManager.addLog(task.id, "🛑 Proceso cancelado.");
                taskManager.updateStatus(task.id, 'cancelled');
            } else {
                await storage.writeFile(statusFileRelPath, JSON.stringify({
                    status: 'completed',
                    endTime: new Date(),
                    target: targetId
                }));
                taskManager.addLog(task.id, importer.getSummary());
                taskManager.setProgress(task.id, 1, {
                    label: "Finalizado",
                    stats: importer.getStats()
                });
                taskManager.addLog(task.id, "✅ ¡Importación finalizada con éxito!");
                taskManager.updateStatus(task.id, 'completed');
            }
        } catch (error: any) {
            console.error("Migration Error:", error);
            taskManager.addLog(task.id, `❌ Error migración: ${error.message}`);
            taskManager.updateStatus(task.id, 'failed');
        }
    })();

    return NextResponse.json({ taskId: task.id });
}
