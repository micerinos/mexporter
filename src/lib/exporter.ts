import 'isomorphic-fetch';
import { getGraphClientForTenant } from './graph';
import { TenantConfig, StorageConfig } from './types';
import { IStorage, getStorage } from './storage';
import path from 'path';

export interface ExportProgress {
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
    itemId?: string;
    itemType?: 'user' | 'site';
    label?: string; // e.g. "120 correos"
}

export class M365Exporter {
    private client: any;
    private storage: IStorage;
    private incremental: boolean;
    private tenantSubfolder: string = '';
    private stats = {
        emails: 0,
        contacts: 0,
        rules: 0,
        files: 0,
        folders: 0,
        unchangedFiles: 0
    };

    private totals = {
        emails: 0,
        contacts: 0,
        rules: 0,
        files: 0,
        folders: 0
    };

    private sanitizeFileName(name: string): string {
        if (!name) return 'unnamed';
        // Replace forbidden characters in Windows/Unix with underscore
        // < > : " / \ | ? *
        return name.replace(/[<>:"/\\|?*]/g, '_').trim();
    }

    constructor(storageConfig: StorageConfig, incremental: boolean = true, tenantName?: string) {
        this.storage = getStorage(storageConfig);
        this.incremental = incremental;
        if (tenantName) {
            this.tenantSubfolder = this.sanitizeFileName(tenantName);
        }
    }

    async initialize(config: TenantConfig) {
        this.client = await getGraphClientForTenant(config);
        // If tenantSubfolder was not set in constructor, we can try to get it from config if provided
        if (!this.tenantSubfolder && config.name) {
            this.tenantSubfolder = this.sanitizeFileName(config.name);
        }
    }

    async scanTotals(id: string, type: 'user' | 'site') {
        try {
            if (type === 'user') {
                const mailFolders = await this.pagedCollect(`/users/${id}/mailFolders`);
                for (const f of mailFolders) {
                    this.totals.emails += (f.totalItemCount || 0);
                }

                // Estimates for contacts/rules/drive are harder to get quickly without iterating,
                // but we can try basic counts if available or just leave them dynamic.
                // For Drive we can get root folder item count if available, but deep scan is slow.
                // We'll stick to emails as the main indicator for now, or do a quick drive check.
                try {
                    const drive = await this.client.api(`/users/${id}/drive`).get();
                    if (drive) {
                        this.totals.files += await this.countDriveFilesFast(drive.id);
                    }
                } catch (e) { }

            } else {
                // Site logic
                try {
                    const drive = await this.client.api(`/sites/${id}/drive`).get();
                    if (drive) {
                        this.totals.files += await this.countDriveFilesFast(drive.id);
                    }
                } catch (e) { }
            }
        } catch (e) {
            console.error('Error scanning export totals:', e);
        }
    }

    getStats() {
        return { ...this.stats, total: this.totals };
    }

    private async pagedCollect(endpoint: string) {
        let all: any[] = [];
        let nextUrl = endpoint;
        while (nextUrl) {
            try {
                const res = await this.client.api(nextUrl).get();
                if (res.value) all.push(...res.value);
                nextUrl = res['@odata.nextLink'];
            } catch (e) {
                console.error(`Error in pagedCollect for ${endpoint}:`, e);
                break;
            }
        }
        return all;
    }

    async exportUser(userId: string, settings: any, onProgress: (p: ExportProgress) => void, signal?: AbortSignal) {
        try {
            const user = await this.client.api(`/users/${userId}`).get();
            const userRelPath = path.join(this.tenantSubfolder, 'users', user.userPrincipalName);
            await this.storage.mkdir(userRelPath);

            onProgress({ message: `Exportando usuario: ${user.userPrincipalName}`, type: 'info', itemId: userId, itemType: 'user' });

            // Save export metadata
            const metadata = {
                exportDate: new Date().toISOString(),
                displayName: user.displayName,
                userPrincipalName: user.userPrincipalName,
                type: 'user'
            };
            await this.storage.writeFile(path.join(userRelPath, '.export_metadata.json'), JSON.stringify(metadata, null, 2));

            if (settings.emails) {
                if (signal?.aborted) return;
                await this.exportEmails(userId, path.join(userRelPath, 'emails'), onProgress, signal);
            }
            if (settings.contacts) {
                if (signal?.aborted) return;
                await this.exportContacts(userId, path.join(userRelPath, 'contacts'), onProgress, signal);
            }
            if (settings.rules) {
                if (signal?.aborted) return;
                await this.exportRules(userId, path.join(userRelPath, 'rules'), onProgress, signal);
            }
            if (settings.onedrive) {
                if (signal?.aborted) return;
                await this.exportOneDrive(userId, path.join(userRelPath, 'onedrive'), onProgress, signal);
            }

            onProgress({ message: `Exportación de ${user.userPrincipalName} completada`, type: 'success' });
        } catch (error: any) {
            onProgress({ message: `Error exportando usuario ${userId}: ${error.message}`, type: 'error' });
        }
    }

    async exportSite(siteId: string, onProgress: (p: ExportProgress) => void, signal?: AbortSignal) {
        try {
            const site = await this.client.api(`/sites/${siteId}`).get();
            const siteName = this.sanitizeFileName(site.name || site.displayName || site.id);
            const siteRelPath = path.join(this.tenantSubfolder, 'sites', siteName);
            await this.storage.mkdir(siteRelPath);

            onProgress({ message: `Exportando sitio: ${site.displayName}`, type: 'info', itemId: siteId, itemType: 'site' });

            // Save export metadata
            const metadata = {
                exportDate: new Date().toISOString(),
                displayName: site.displayName,
                name: siteName,
                type: 'site'
            };
            await this.storage.writeFile(path.join(siteRelPath, '.export_metadata.json'), JSON.stringify(metadata, null, 2));

            const drives = await this.pagedCollect(`/sites/${siteId}/drives`);
            onProgress({ message: `Librerías encontradas: ${drives.length}`, type: 'info' });

            if (drives.length === 0) {
                // Fallback: search for the default 'Documents' drive if drives list is empty (rare but happens)
                try {
                    const defaultDrive = await this.client.api(`/sites/${siteId}/drive`).get();
                    if (defaultDrive) drives.push(defaultDrive);
                } catch (e) { }
            }

            for (const drive of drives) {
                if (signal?.aborted) return;
                onProgress({ message: `Procesando librería: ${drive.name}`, type: 'info' });
                await this.exportDrive(drive.id, path.join(siteRelPath, this.sanitizeFileName(drive.name)), onProgress, signal);
            }

            onProgress({ message: `Exportación de sitio ${site.displayName} completada`, type: 'success' });
        } catch (error: any) {
            onProgress({ message: `Error exportando sitio ${siteId}: ${error.message}`, type: 'error' });
        }
    }

    private async exportEmails(userId: string, targetRelPath: string, onProgress: (p: ExportProgress) => void, signal?: AbortSignal) {
        onProgress({ message: `Exportando correos...`, type: 'info' });
        const folders = await this.pagedCollect(`/users/${userId}/mailFolders`);

        for (const folder of folders) {
            if (signal?.aborted) return;
            const folderRelPath = path.join(targetRelPath, this.sanitizeFileName(folder.displayName));
            await this.storage.mkdir(folderRelPath);

            // Fetch all messages for current folder
            let nextUrl = `/users/${userId}/mailFolders/${folder.id}/messages?$select=id,subject,receivedDateTime,internetMessageId,hasAttachments&$top=999`;
            while (nextUrl) {
                if (signal?.aborted) return;
                const res = await this.client.api(nextUrl).get();
                for (const msg of res.value) {
                    if (signal?.aborted) return;
                    const fileName = `${msg.receivedDateTime?.replace(/[:.]/g, '-')}_${msg.id}.json`;
                    const fileRelPath = path.join(folderRelPath, fileName);

                    if (this.incremental && await this.storage.exists(fileRelPath)) {
                        this.stats.unchangedFiles++;
                        continue;
                    }


                    try {
                        const fullMsg = await this.client.api(`/users/${userId}/messages/${msg.id}`)
                            .expand(`attachments,singleValueExtendedProperties($filter=id eq 'SystemTime 0x0E06' or id eq 'SystemTime 0x0039' or id eq 'String 0x001A' or id eq 'Integer 0x0E07' or id eq 'String 0x1035')`)
                            .get();
                        await this.storage.writeFile(fileRelPath, JSON.stringify(fullMsg, null, 2));
                        this.stats.emails++;
                        onProgress({
                            message: `Correo exportado: ${msg.subject || 'Sin asunto'}`,
                            type: 'success',
                            label: `Exportando buzón... (${this.stats.emails}/${this.totals.emails || '?'})`
                        });
                    } catch (e: any) {
                        onProgress({ message: `Aviso: No se pudo descargar mensaje ${msg.id}: ${e.message}`, type: 'warning' });
                    }
                }
                nextUrl = res['@odata.nextLink'];
            }
        }
    }

    private async exportContacts(userId: string, targetRelPath: string, onProgress: (p: ExportProgress) => void, signal?: AbortSignal) {
        if (signal?.aborted) return;
        onProgress({ message: `Exportando contactos...`, type: 'info' });
        await this.storage.mkdir(targetRelPath);
        const contacts = await this.pagedCollect(`/users/${userId}/contacts`);
        await this.storage.writeFile(path.join(targetRelPath, 'contacts.json'), JSON.stringify(contacts, null, 2));
        this.stats.contacts += contacts.length;
    }

    private async exportRules(userId: string, targetRelPath: string, onProgress: (p: ExportProgress) => void, signal?: AbortSignal) {
        if (signal?.aborted) return;
        onProgress({ message: `Exportando reglas...`, type: 'info' });
        await this.storage.mkdir(targetRelPath);
        try {
            // Note: the correct endpoint for user rules is /users/{id}/mailFolders/inbox/messageRules 
            // but sometimes it's better to check if there are rules at the top level /users/{id}/messagesRules (if supported)
            // or stick to inbox which is where most rules live.
            const rules = await this.client.api(`/users/${userId}/mailFolders/inbox/messageRules`).get();
            if (rules && rules.value) {
                await this.storage.writeFile(path.join(targetRelPath, 'rules.json'), JSON.stringify(rules.value, null, 2));
                this.stats.rules += rules.value.length;
                onProgress({ message: `Reglas exportadas: ${rules.value.length}`, type: 'success' });
            }
        } catch (e: any) {
            onProgress({ message: `Aviso: No se pudieron exportar reglas (posiblemente no tenga buzón): ${e.message}`, type: 'warning' });
        }
    }

    private async exportOneDrive(userId: string, targetRelPath: string, onProgress: (p: ExportProgress) => void, signal?: AbortSignal) {
        if (signal?.aborted) return;
        onProgress({ message: `Exportando OneDrive...`, type: 'info' });
        try {
            const drive = await this.client.api(`/users/${userId}/drive`).get();
            await this.exportDrive(drive.id, targetRelPath, onProgress, signal);
        } catch (e) {
            onProgress({ message: `Usuario no tiene OneDrive activo`, type: 'warning' });
        }
    }

    private async exportDrive(driveId: string, targetRelPath: string, onProgress: (p: ExportProgress) => void, signal?: AbortSignal) {
        await this.storage.mkdir(targetRelPath);
        await this.downloadDriveItems(driveId, 'root', targetRelPath, onProgress, signal);
    }

    private async downloadDriveItems(driveId: string, itemId: string, localRelPath: string, onProgress: (p: ExportProgress) => void, signal?: AbortSignal) {
        let nextUrl = `/drives/${driveId}/items/${itemId}/children`;
        while (nextUrl) {
            if (signal?.aborted) return;
            const res = await this.client.api(nextUrl).get();
            if (!res || !res.value) break;

            if (res.value.length > 0) {
                onProgress({ message: `Carpeta: ${path.basename(localRelPath)} (${res.value.length} elementos)`, type: 'info' });
            }

            for (const item of res.value) {
                if (signal?.aborted) return;
                const fileName = this.sanitizeFileName(item.name);
                const itemRelPath = path.join(localRelPath, fileName);

                if (item.folder) {
                    onProgress({ message: `Creando carpeta: ${fileName}`, type: 'info' });
                    await this.storage.mkdir(itemRelPath);
                    this.stats.folders++;
                    await this.downloadDriveItems(driveId, item.id, itemRelPath, onProgress, signal);
                } else {
                    // Log item details for debugging
                    const hasFile = !!item.file;
                    const hasDownloadUrl = !!item['@microsoft.graph.downloadUrl'];

                    if (this.incremental) {
                        try {
                            const exists = await this.storage.exists(itemRelPath);
                            if (exists) {
                                const mtime = await this.storage.getMTime(itemRelPath);
                                const serverDate = new Date(item.lastModifiedDateTime);
                                if (mtime && mtime >= serverDate) {
                                    this.stats.unchangedFiles++;
                                    continue;
                                }
                            }
                        } catch (e: any) {
                            onProgress({ message: `Aviso: Error comprobando existencia de ${fileName}: ${e.message}`, type: 'warning' });
                        }
                    }

                    onProgress({ message: `Descargando: ${fileName}${!hasFile ? ' (item)' : ''}`, type: 'info' });
                    try {
                        let downloadUrl = item['@microsoft.graph.downloadUrl'];
                        let buffer: any;

                        if (downloadUrl) {
                            const response = await fetch(downloadUrl);
                            if (!response.ok) throw new Error(`HTTP ${response.status}`);
                            const ab = await response.arrayBuffer();
                            buffer = Buffer.from(ab);
                        } else {
                            // Fallback for SharePoint items without direct download URL
                            // We use the /content endpoint which returns the raw bytes
                            const resContent = await this.client.api(`/drives/${driveId}/items/${item.id}/content`).get();

                            if (resContent instanceof ArrayBuffer) {
                                buffer = Buffer.from(resContent);
                            } else if (Buffer.isBuffer(resContent)) {
                                buffer = resContent;
                            } else if (typeof resContent === 'string') {
                                buffer = Buffer.from(resContent);
                            } else if (resContent && typeof resContent.on === 'function') {
                                // It's a stream (Node.js)
                                buffer = await new Promise((resolve, reject) => {
                                    const chunks: any[] = [];
                                    resContent.on('data', (chunk: any) => chunks.push(chunk));
                                    resContent.on('end', () => resolve(Buffer.concat(chunks)));
                                    resContent.on('error', reject);
                                });
                            } else {
                                throw new Error("Formato de contenido no reconocido");
                            }
                        }

                        await this.storage.writeFile(itemRelPath, buffer);
                        this.stats.files++;
                        onProgress({ message: `Elemento exportado: ${item.name}`, type: 'success', label: `Descargando archivos... (${this.stats.files})` });

                        const metadata = {
                            name: item.name,
                            id: item.id,
                            webUrl: item.webUrl,
                            createdDateTime: item.createdDateTime,
                            lastModifiedDateTime: item.lastModifiedDateTime,
                            etag: item.eTag,
                            size: item.size,
                            source: hasDownloadUrl ? 'direct' : 'content-api'
                        };
                        await this.storage.writeFile(`${itemRelPath}.metadata.json`, JSON.stringify(metadata, null, 2));
                    } catch (e: any) {
                        onProgress({ message: `Error en ${fileName}: ${e.message}`, type: 'error' });
                    }
                }
            }
            nextUrl = res['@odata.nextLink'];
        }
    }

    getSummary() {
        return `RESUMEN DE EXPORTACIÓN:
- Correos: ${this.stats.emails}
- Contactos: ${this.stats.contacts}
- Reglas: ${this.stats.rules}
- Archivos descargados: ${this.stats.files}
- Archivos ya actualizados: ${this.stats.unchangedFiles}
- Carpetas procesadas: ${this.stats.folders}`;
    }

    private async countDriveFilesFast(driveId: string): Promise<number> {
        let count = 0;
        try {
            const items = await this.pagedCollect(`/drives/${driveId}/list/items?$select=id&$expand=driveItem($select=file)`);
            for (const item of items) {
                if (item.driveItem?.file) {
                    count++;
                }
            }
        } catch (e) {
            console.error(`Error counting files fast for drive ${driveId}:`, e);
        }
        return count;
    }
}
