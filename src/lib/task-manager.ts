
export type TaskStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface Task {
    id: string;
    type: 'export' | 'import';
    status: TaskStatus;
    startTime: Date;
    endTime?: Date;
    progress: number;
    logs: string[];
    details: any;
}

class TaskManager {
    private tasks: Map<string, Task> = new Map();
    private activeProcesses: Map<string, AbortController> = new Map();

    constructor() { }

    createTask(type: 'export' | 'import', details: any): Task {
        const id = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const task: Task = {
            id,
            type,
            status: 'running',
            startTime: new Date(),
            progress: 0,
            logs: [],
            details
        };
        this.tasks.set(id, task);
        return task;
    }

    getTask(id: string): Task | undefined {
        return this.tasks.get(id);
    }

    getAllTasks(): Task[] {
        return Array.from(this.tasks.values()).sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
    }

    addLog(id: string, message: string) {
        const task = this.tasks.get(id);
        if (task) {
            task.logs.push(`[${new Date().toLocaleTimeString()}] ${message}`);
            // Keep logs manageable
            if (task.logs.length > 1000) task.logs.shift();
        }
    }

    updateStatus(id: string, status: TaskStatus) {
        const task = this.tasks.get(id);
        if (task) {
            task.status = status;
            if (status !== 'running') {
                task.endTime = new Date();
                this.activeProcesses.delete(id);
            }
        }
    }

    registerAbortController(id: string, controller: AbortController) {
        this.activeProcesses.set(id, controller);
    }

    cancelTask(id: string) {
        const controller = this.activeProcesses.get(id);
        if (controller) {
            controller.abort();
            this.updateStatus(id, 'cancelled');
            this.addLog(id, "⚠️ Proceso cancelado por el usuario.");
        }
    }

    setProgress(id: string, progress: number, currentProgress?: any) {
        const task = this.tasks.get(id);
        if (task) {
            task.progress = progress;
            if (currentProgress) {
                task.details = { ...task.details, currentProgress };
            }
        }
    }
}

// Global instance to persist during app lifecycle (in self-hosted Node)
// Global instance to persist during app lifecycle (in self-hosted Node)
const globalForTasks = global as unknown as { taskManager: TaskManager | undefined };

// Ensure we don't use a stale instance during development HMR if the class definition changed
const getValidInstanceManager = (): TaskManager => {
    const instance = globalForTasks.taskManager;
    // Check if instance exists and has the new methods we depend on (e.g. setProgress)
    if (instance && typeof instance.setProgress === 'function') {
        return instance;
    }
    return new TaskManager();
};

export const taskManager = getValidInstanceManager();

if (process.env.NODE_ENV !== 'production') globalForTasks.taskManager = taskManager;
