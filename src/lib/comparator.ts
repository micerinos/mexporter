import { getGraphClientForTenant } from './graph';
import { TenantConfig, StorageConfig } from './types';
import { IStorage, getStorage } from './storage';
import path from 'path';

export interface ComparisonReport {
    type: 'user' | 'site';
    sourceName: string;
    targetId: string;
    timestamp: Date;
    sections: {
        title: string;
        tenantSourceCount?: number;
        exportedCount: number;
        importedCount: number;
        status: 'ok' | 'mismatch' | 'error';
        details?: string[];
        items?: { name: string; source: number; exported: number; target: number; status: 'ok' | 'mismatch' }[];
    }[];
}

export class M365Comparator {
    private destClient: any;
    private sourceClient: any;
    private storage: IStorage;

    constructor(storageConfig: StorageConfig) {
        this.storage = getStorage(storageConfig);
    }

    async initialize(destConfig?: TenantConfig, sourceConfig?: TenantConfig) {
        if (destConfig) {
            this.destClient = await getGraphClientForTenant(destConfig);
        }
        if (sourceConfig) {
            this.sourceClient = await getGraphClientForTenant(sourceConfig);
        }
    }

    private async pagedCollect(client: any, endpoint: string) {
        let all: any[] = [];
        let nextUrl = endpoint;
        while (nextUrl) {
            const res = await client.api(nextUrl).get();
            if (res.value) {
                all.push(...res.value);
            }
            nextUrl = res['@odata.nextLink'];
        }
        return all;
    }

    private async getAllMailFolders(client: any, userId: string, folderId?: string): Promise<any[]> {
        const endpoint = folderId
            ? `/users/${userId}/mailFolders/${folderId}/childFolders`
            : `/users/${userId}/mailFolders`;

        let folders = await this.pagedCollect(client, endpoint);
        let allFolders = [...folders];

        for (const folder of folders) {
            if (folder.childFolderCount > 0) {
                const children = await this.getAllMailFolders(client, userId, folder.id);
                allFolders.push(...children);
            }
        }
        return allFolders;
    }

    async compareUser(contentRelPath: string, targetPrincipalName: string, sourcePrincipalName?: string): Promise<ComparisonReport> {
        const report: ComparisonReport = {
            type: 'user',
            sourceName: contentRelPath,
            targetId: targetPrincipalName,
            timestamp: new Date(),
            sections: []
        };

        let targetUserId: string | null = null;
        let sourceUserId: string | null = null;

        try {
            const encodedTarget = encodeURIComponent(targetPrincipalName.trim());
            const targetUser = await this.destClient.api(`/users/${encodedTarget}`).get();
            targetUserId = targetUser.id;
        } catch (e: any) {
            console.warn(`Aviso: No se encontró el usuario en destino: ${targetPrincipalName}`);
        }

        try {
            if (this.sourceClient && sourcePrincipalName) {
                const encodedSource = encodeURIComponent(sourcePrincipalName.trim());
                console.log(`DEBUG: Buscando usuario origen: ${sourcePrincipalName}`);
                const sourceUser = await this.sourceClient.api(`/users/${encodedSource}`).get();
                sourceUserId = sourceUser.id;
                console.log(`DEBUG: Usuario origen encontrado: ${sourceUserId}`);
            } else {
                console.log("DEBUG: No hay sourceClient o sourcePrincipalName", { hasClient: !!this.sourceClient, upn: sourcePrincipalName });
            }
        } catch (e: any) {
            console.warn(`Aviso: No se encontró el usuario en origen: ${sourcePrincipalName}`, e.message);
        }

        // 1. Compare Emails
        const emailsPath = path.join(contentRelPath, 'emails');
        if (await this.storage.exists(emailsPath)) {
            let totalSourceTenant = 0;
            let totalExported = 0;
            let totalImported = 0;
            let items: any[] = [];
            let status: 'ok' | 'mismatch' | 'error' = 'ok';

            try {
                const exportedFolders = await this.storage.readdir(emailsPath);

                let targetFolders: any[] = [];
                if (this.destClient && targetUserId) {
                    targetFolders = await this.getAllMailFolders(this.destClient, targetUserId);
                }

                let sourceTenantFolders: any[] = [];
                if (this.sourceClient && sourceUserId) {
                    sourceTenantFolders = await this.getAllMailFolders(this.sourceClient, sourceUserId);
                }

                for (const folderEntry of exportedFolders) {
                    if (!folderEntry.isDir) continue;
                    const folderName = folderEntry.name;

                    const folderItems = await this.storage.readdir(path.join(emailsPath, folderName)).catch(() => []);
                    const exportedMsgs = folderItems.filter(f => !f.isDir && f.name.endsWith('.json')).length;
                    totalExported += exportedMsgs;

                    const targetFolder = targetFolders.find(f =>
                        f.displayName.toLowerCase() === folderName.toLowerCase() ||
                        this.folderNameMatches(f.displayName, folderName)
                    );
                    const importedMsgs = targetFolder?.totalItemCount || 0;
                    totalImported += importedMsgs;

                    let sourceTenantMsgs = 0;
                    if (this.sourceClient) {
                        const sourceFolder = sourceTenantFolders.find(f =>
                            f.displayName.toLowerCase() === folderName.toLowerCase() ||
                            this.folderNameMatches(f.displayName, folderName)
                        );
                        sourceTenantMsgs = sourceFolder?.totalItemCount || 0;
                        totalSourceTenant += sourceTenantMsgs;
                    }

                    let itemStatus: 'ok' | 'mismatch' = 'ok';
                    if (this.sourceClient && sourceTenantMsgs !== exportedMsgs) {
                        itemStatus = 'mismatch';
                    }
                    if (this.destClient && exportedMsgs !== importedMsgs) {
                        itemStatus = 'mismatch';
                    }

                    if (itemStatus === 'mismatch') status = 'mismatch';

                    items.push({
                        name: folderName,
                        source: this.sourceClient ? sourceTenantMsgs : undefined,
                        exported: exportedMsgs,
                        target: this.destClient ? importedMsgs : undefined,
                        status: itemStatus
                    });
                }
            } catch (e: any) {
                console.error("Error comparando correos:", e);
                status = 'error';
            }

            report.sections.push({
                title: 'Correos Electrónicos',
                tenantSourceCount: this.sourceClient ? totalSourceTenant : undefined,
                exportedCount: totalExported,
                importedCount: totalImported,
                status,
                items
            });
        }

        // 2. Compare OneDrive Files
        const onedrivePath = path.join(contentRelPath, 'onedrive');
        if (await this.storage.exists(onedrivePath)) {
            let tenantSourceFiles = 0;
            let exportedFiles = 0;
            let importedFiles = 0;
            let status: 'ok' | 'mismatch' | 'error' = 'ok';
            let details: string[] = [];

            try {
                exportedFiles = await this.countStorageFiles(onedrivePath);

                if (targetUserId) {
                    try {
                        const targetDrive = await this.destClient.api(`/users/${targetUserId}/drive`).get();
                        importedFiles = await this.countDriveFilesFast(this.destClient, targetDrive.id);
                    } catch (e) { }
                }

                if (this.sourceClient && sourceUserId) {
                    try {
                        const sourceDrive = await this.sourceClient.api(`/users/${sourceUserId}/drive`).get();
                        tenantSourceFiles = await this.countDriveFilesFast(this.sourceClient, sourceDrive.id);
                    } catch (e) { }
                }

                const isMismatch = (this.sourceClient && tenantSourceFiles !== exportedFiles) ||
                    (this.destClient && exportedFiles !== importedFiles);

                if (isMismatch) {
                    status = 'mismatch';
                    details.push(`Discrepancia: Original=${tenantSourceFiles}, Backup=${exportedFiles}${this.destClient ? `, Destino=${importedFiles}` : ''}.`);
                }
            } catch (e: any) {
                status = 'error';
                details.push(`Error accediendo a OneDrive: ${e.message}`);
            }

            report.sections.push({
                title: 'Archivos OneDrive',
                tenantSourceCount: this.sourceClient ? tenantSourceFiles : undefined,
                exportedCount: exportedFiles,
                importedCount: importedFiles,
                status,
                details: details.length > 0 ? details : undefined
            });
        }

        // 3. Compare Contacts
        const contactsPath = path.join(contentRelPath, 'contacts', 'contacts.json');
        if (await this.storage.exists(contactsPath)) {
            let tenantSourceCount = 0;
            let exportedCount = 0;
            let importedCount = 0;
            let status: 'ok' | 'mismatch' | 'error' = 'ok';

            try {
                const buffer = await this.storage.readFile(contactsPath);
                exportedCount = JSON.parse(buffer.toString('utf8')).length;

                if (targetUserId) {
                    const remoteContacts = await this.pagedCollect(this.destClient, `/users/${targetUserId}/contacts`);
                    importedCount = remoteContacts.length;
                }

                if (this.sourceClient && sourceUserId) {
                    const sourceContacts = await this.pagedCollect(this.sourceClient, `/users/${sourceUserId}/contacts`);
                    tenantSourceCount = sourceContacts.length;
                }

                const isMismatch = (this.sourceClient && tenantSourceCount !== exportedCount) ||
                    (this.destClient && exportedCount !== importedCount);

                if (isMismatch) status = 'mismatch';
            } catch (e: any) {
                status = 'error';
            }

            report.sections.push({
                title: 'Contactos',
                tenantSourceCount: this.sourceClient ? tenantSourceCount : undefined,
                exportedCount,
                importedCount,
                status
            });
        }

        return report;
    }

    async compareSite(contentRelPath: string, targetSiteId: string, sourceSiteId?: string): Promise<ComparisonReport> {
        const report: ComparisonReport = {
            type: 'site',
            sourceName: contentRelPath,
            targetId: targetSiteId,
            timestamp: new Date(),
            sections: []
        };

        try {
            const drives = await this.storage.readdir(contentRelPath);
            let totalTenantSource = 0;
            let totalExported = 0;
            let totalImported = 0;
            let items: any[] = [];
            let status: 'ok' | 'mismatch' | 'error' = 'ok';

            let targetDrives: any[] = [];
            try {
                const encodedTarget = encodeURIComponent(targetSiteId.trim());
                targetDrives = await this.pagedCollect(this.destClient, `/sites/${encodedTarget}/drives`);
            } catch (e) {
                console.warn(`Aviso: No se pudo acceder al sitio destino ${targetSiteId}`);
            }

            let sourceDrives: any[] = [];
            if (this.sourceClient && sourceSiteId) {
                try {
                    const encodedSource = encodeURIComponent(sourceSiteId.trim());
                    sourceDrives = await this.pagedCollect(this.sourceClient, `/sites/${encodedSource}/drives`);
                } catch (e) {
                    try {
                        const search = await this.sourceClient.api('/sites').search(sourceSiteId).get();
                        if (search.value && search.value.length > 0) {
                            sourceDrives = await this.pagedCollect(this.sourceClient, `/sites/${search.value[0].id}/drives`);
                        }
                    } catch (e2) { }
                }
            }

            for (const driveEntry of drives) {
                if (!driveEntry.isDir) continue;
                const driveName = driveEntry.name;
                if (driveName.startsWith('.')) continue;

                const driveRelPath = path.join(contentRelPath, driveName);
                const exportedCount = await this.countStorageFiles(driveRelPath);
                totalExported += exportedCount;

                let sourceTenantCount = 0;
                let targetCount = 0;

                try {
                    const targetDrive = targetDrives.find((d: any) =>
                        d.name.toLowerCase() === driveName.toLowerCase() ||
                        (driveName === 'Documents' && d.name === 'Documentos') ||
                        (driveName === 'Documentos' && d.name === 'Documents')
                    );
                    if (targetDrive) {
                        targetCount = await this.countDriveFilesFast(this.destClient, targetDrive.id);
                        totalImported += targetCount;
                    }

                    if (this.sourceClient) {
                        const sourceDrive = sourceDrives.find((d: any) =>
                            d.name.toLowerCase() === driveName.toLowerCase() ||
                            (driveName === 'Documents' && d.name === 'Documentos') ||
                            (driveName === 'Documentos' && d.name === 'Documents')
                        );
                        if (sourceDrive) {
                            sourceTenantCount = await this.countDriveFilesFast(this.sourceClient, sourceDrive.id);
                            totalTenantSource += sourceTenantCount;
                        }
                    }

                    let itemStatus: 'ok' | 'mismatch' = 'ok';
                    if (this.sourceClient && sourceTenantCount !== exportedCount) {
                        itemStatus = 'mismatch';
                    }
                    if (this.destClient && exportedCount !== targetCount) {
                        itemStatus = 'mismatch';
                    }

                    if (itemStatus === 'mismatch') status = 'mismatch';

                    items.push({
                        name: driveName,
                        source: this.sourceClient ? sourceTenantCount : undefined,
                        exported: exportedCount,
                        target: this.destClient ? targetCount : undefined,
                        status: itemStatus
                    });
                } catch (e: any) {
                    status = 'error';
                }
            }

            report.sections.push({
                title: 'Archivos de SharePoint',
                tenantSourceCount: this.sourceClient ? totalTenantSource : undefined,
                exportedCount: totalExported,
                importedCount: totalImported,
                status,
                items
            });

        } catch (error: any) {
            report.sections.push({ title: 'Sitio SharePoint', exportedCount: 0, importedCount: 0, status: 'error', details: [error.message] });
        }

        return report;
    }

    private async countStorageFiles(relPath: string): Promise<number> {
        let count = 0;
        const items = await this.storage.readdir(relPath).catch(() => []);
        for (const item of items) {
            if (item.name.startsWith('.') || item.name.endsWith('.metadata.json')) continue;
            const itemPath = path.join(relPath, item.name);

            if (item.isDir) {
                count += await this.countStorageFiles(itemPath);
            } else {
                count++;
            }
        }
        return count;
    }

    private async countDriveFilesFast(client: any, driveId: string): Promise<number> {
        let count = 0;
        try {
            // This is MUCH faster than recursive traversal because it uses the flat list of the drive
            const items = await this.pagedCollect(client, `/drives/${driveId}/list/items?$select=id&$expand=driveItem($select=id,file)`);
            for (const item of items) {
                if (item.driveItem && item.driveItem.file) {
                    count++;
                }
            }
        } catch (e) {
            console.error(`Error counting files fast for drive ${driveId}:`, e);
        }
        return count;
    }

    private folderNameMatches(name1: string, name2: string): boolean {
        const n1 = name1.toLowerCase();
        const n2 = name2.toLowerCase();
        if (n1 === n2) return true;

        // Common translations
        const mappings: Record<string, string[]> = {
            'inbox': ['bandeja de entrada'],
            'sent items': ['elementos enviados', 'sent'],
            'drafts': ['borradores'],
            'deleted items': ['elementos eliminados', 'trash', 'papelera'],
            'junk email': ['correo no deseado', 'junk'],
            'archive': ['archivo']
        };

        for (const [en, esList] of Object.entries(mappings)) {
            if ((n1 === en && esList.includes(n2)) || (n2 === en && esList.includes(n1))) {
                return true;
            }
        }

        return false;
    }
}
