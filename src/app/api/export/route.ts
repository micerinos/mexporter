import { NextRequest, NextResponse } from "next/server";
import { M365Exporter } from "@/lib/exporter";
import { taskManager } from "@/lib/task-manager";

export async function POST(req: NextRequest) {
    const body = await req.json();
    const { selectedUsers, selectedSites, settings, config, storageConfig } = body;

    const task = taskManager.createTask('export', { selectedUsers, selectedSites });
    const abortController = new AbortController();
    taskManager.registerAbortController(task.id, abortController);

    // Run in background (async without blocking response)
    (async () => {
        try {
            const exporter = new M365Exporter(storageConfig, settings.incremental, config.name);
            await exporter.initialize(config);

            taskManager.addLog(task.id, "🚀 Iniciando proceso de exportación en segundo plano...");

            taskManager.addLog(task.id, 'Calculando elementos totales...');
            for (const userId of selectedUsers) {
                await exporter.scanTotals(userId, 'user');
                taskManager.setProgress(task.id, 0.1, { stats: exporter.getStats() });
            }
            for (const siteId of selectedSites) {
                await exporter.scanTotals(siteId, 'site');
                taskManager.setProgress(task.id, 0.1, { stats: exporter.getStats() });
            }

            // Export Users
            for (const userId of selectedUsers) {
                if (abortController.signal.aborted) break;
                await exporter.exportUser(userId, settings, (p) => {
                    taskManager.addLog(task.id, p.message);
                    // Always update progress stats
                    taskManager.setProgress(task.id, 0.5, {
                        itemId: p.itemId || userId,
                        itemType: p.itemType || 'user',
                        label: p.label || p.message,
                        stats: exporter.getStats()
                    });
                }, abortController.signal);
            }

            // Export Sites
            for (const siteId of selectedSites) {
                if (abortController.signal.aborted) break;
                await exporter.exportSite(siteId, (p) => {
                    taskManager.addLog(task.id, p.message);
                    // Always update progress stats
                    taskManager.setProgress(task.id, 0.5, {
                        itemId: p.itemId || siteId,
                        itemType: p.itemType || 'site',
                        label: p.label || p.message,
                        stats: exporter.getStats()
                    });
                }, abortController.signal);
            }

            if (abortController.signal.aborted) {
                taskManager.addLog(task.id, "🛑 Proceso cancelado.");
                taskManager.updateStatus(task.id, 'cancelled');
            } else {
                taskManager.addLog(task.id, exporter.getSummary());
                taskManager.addLog(task.id, "✅ ¡Exportación finalizada con éxito!");
                taskManager.updateStatus(task.id, 'completed');
            }
        } catch (error: any) {
            console.error("Task Error:", error);
            taskManager.addLog(task.id, `❌ Error crítico: ${error.message}`);
            taskManager.updateStatus(task.id, 'failed');
        }
    })();

    return NextResponse.json({ taskId: task.id });
}
