import 'isomorphic-fetch';
import { getGraphClientForTenant } from './graph';
import { TenantConfig, StorageConfig } from './types';
import { IStorage, getStorage } from './storage';
import path from 'path';

export interface MigrationProgress {
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
    itemId?: string;
    itemType?: 'user' | 'site';
    label?: string;
}

export class M365Importer {
    private client: any;
    private storage: IStorage;
    private stats = {
        emails: 0,
        contacts: 0,
        rules: 0,
        files: 0,
        folders: 0
    };

    private totals = {
        emails: 0,
        contacts: 0,
        rules: 0,
        files: 0,
        folders: 0
    };

    constructor(storageConfig: StorageConfig) {
        this.storage = getStorage(storageConfig);
    }

    async initialize(config: TenantConfig) {
        this.client = await getGraphClientForTenant(config);
    }

    async scanTotals(contentRelPath: string, type: 'user' | 'site') {
        try {
            if (type === 'user') {
                const emailsPath = path.join(contentRelPath, 'emails');
                if (await this.storage.exists(emailsPath)) {
                    const folders = await this.storage.readdir(emailsPath);
                    for (const folder of folders) {
                        if (folder.isDir) {
                            const msgs = await this.storage.readdir(path.join(emailsPath, folder.name));
                            this.totals.emails += msgs.filter(f => f.name.endsWith('.json')).length;
                        }
                    }
                }

                const contactsPath = path.join(contentRelPath, 'contacts/contacts.json');
                if (await this.storage.exists(contactsPath)) {
                    const buffer = await this.storage.readFile(contactsPath);
                    const contacts = JSON.parse(buffer.toString('utf8'));
                    this.totals.contacts = contacts.length || 0;
                }

                const rulesPath = path.join(contentRelPath, 'rules/rules.json');
                if (await this.storage.exists(rulesPath)) {
                    const buffer = await this.storage.readFile(rulesPath);
                    const rules = JSON.parse(buffer.toString('utf8'));
                    this.totals.rules = rules.length || 0;
                }

                const onedrivePath = path.join(contentRelPath, 'onedrive');
                if (await this.storage.exists(onedrivePath)) {
                    await this.countFiles(onedrivePath);
                }
            } else {
                await this.countFiles(contentRelPath);
            }
        } catch (e) {
            console.error('Error scanning totals:', e);
        }
    }

    private async countFiles(dirPath: string) {
        const items = await this.storage.readdir(dirPath);
        for (const item of items) {
            if (item.name.endsWith('.metadata.json') || item.name.startsWith('.')) continue;

            if (item.isDir) {
                this.totals.folders++;
                await this.countFiles(path.join(dirPath, item.name));
            } else {
                this.totals.files++;
            }
        }
    }

    private async pagedCollect(endpoint: string) {
        let all: any[] = [];
        let nextUrl = endpoint;
        while (nextUrl) {
            const res = await this.client.api(nextUrl).get();
            all.push(...res.value);
            nextUrl = res['@odata.nextLink'];
        }
        return all;
    }

    async importUser(contentRelPath: string, targetUserPrincipalName: string, onProgress: (p: MigrationProgress) => void, settings: any = { emails: true, contacts: true, rules: true, onedrive: true }, signal?: AbortSignal) {
        try {
            onProgress({ message: `Iniciando importación para: ${targetUserPrincipalName}`, type: 'info' });

            let targetUser;
            try {
                targetUser = await this.client.api(`/users/${targetUserPrincipalName}`).get();
            } catch (e) {
                throw new Error(`Usuario destino ${targetUserPrincipalName} no encontrado.`);
            }

            const onedriveRelPath = path.join(contentRelPath, 'onedrive');
            if (settings.onedrive && await this.storage.exists(onedriveRelPath)) {
                if (signal?.aborted) return;
                onProgress({ message: `Restaurando usuario: ${targetUserPrincipalName}`, type: 'info', itemId: targetUser.id, itemType: 'user' });
                await this.uploadToDrive(targetUser.id, 'root', onedriveRelPath, onProgress, false, signal);
            }

            const emailsRelPath = path.join(contentRelPath, 'emails');
            if (settings.emails && await this.storage.exists(emailsRelPath)) {
                if (signal?.aborted) return;
                onProgress({ message: `Importando Correos...`, type: 'info' });
                await this.importEmails(targetUser.id, emailsRelPath, onProgress, signal);
            }

            const contactsRelPath = path.join(contentRelPath, 'contacts');
            if (settings.contacts && await this.storage.exists(contactsRelPath)) {
                if (signal?.aborted) return;
                onProgress({ message: `Importando Contactos...`, type: 'info' });
                await this.importContacts(targetUser.id, contactsRelPath, onProgress, signal);
            }

            const rulesRelPath = path.join(contentRelPath, 'rules');
            if (settings.rules && await this.storage.exists(rulesRelPath)) {
                if (signal?.aborted) return;
                onProgress({ message: `Importando Reglas...`, type: 'info' });
                await this.importRules(targetUser.id, rulesRelPath, onProgress, signal);
            }

            onProgress({ message: `Importación de ${targetUserPrincipalName} completada`, type: 'success' });
        } catch (error: any) {
            onProgress({ message: `Error importando usuario: ${error.message}`, type: 'error' });
        }
    }

    async importSite(contentRelPath: string, targetSiteId: string, onProgress: (p: MigrationProgress) => void, signal?: AbortSignal) {
        try {
            onProgress({ message: `Restaurando sitio: ${targetSiteId}`, type: 'info', itemId: targetSiteId, itemType: 'site' });
            const entries = await this.storage.readdir(contentRelPath);

            for (const entry of entries) {
                if (!entry.isDir) continue;
                if (signal?.aborted) return;
                const entryRelPath = path.join(contentRelPath, entry.name);
                onProgress({ message: `Importando librería/carpeta: ${entry.name}`, type: 'info' });
                await this.uploadToDrive(targetSiteId, 'root', entryRelPath, onProgress, true, signal);
            }

            onProgress({ message: `Importación en sitio completada`, type: 'success' });
        } catch (error: any) {
            onProgress({ message: `Error importando sitio: ${error.message}`, type: 'error' });
        }
    }

    private async importEmails(userId: string, emailsRelPath: string, onProgress: (p: MigrationProgress) => void, signal?: AbortSignal) {
        const folders = await this.storage.readdir(emailsRelPath);

        for (const folderEntry of folders) {
            if (!folderEntry.isDir) continue;
            const folderName = folderEntry.name;
            const folderRelPath = path.join(emailsRelPath, folderName);
            onProgress({ message: `Procesando carpeta de correo: ${folderName}`, type: 'info' });

            let remoteFolder;
            try {
                const existingFolders = await this.pagedCollect(`/users/${userId}/mailFolders`);
                remoteFolder = existingFolders.find(f => f.displayName === folderName);

                if (!remoteFolder) {
                    remoteFolder = await this.client.api(`/users/${userId}/mailFolders`).post({
                        displayName: folderName
                    });
                }

                // Collect existing messages in target folder to avoid duplicates
                // internetMessageId is the most reliable, subject|date as fallback
                const existingMessages = await this.pagedCollect(`/users/${userId}/mailFolders/${remoteFolder.id}/messages?$select=subject,receivedDateTime,internetMessageId`);
                const existingIds = new Set(existingMessages.map(m => m.internetMessageId).filter(Boolean));
                const existingKeys = new Set(existingMessages.map(m => `${m.subject}|${m.receivedDateTime}`));

                const messages = (await this.storage.readdir(folderRelPath)).filter(f => !f.isDir && f.name.endsWith('.json'));
                for (const msgEntry of messages) {
                    if (signal?.aborted) return;
                    const msgFile = msgEntry.name;

                    try {
                        const buffer = await this.storage.readFile(path.join(folderRelPath, msgFile));
                        const msgContent = JSON.parse(buffer.toString('utf8'));

                        // Deduplication check
                        if (msgContent.internetMessageId && existingIds.has(msgContent.internetMessageId)) continue;
                        const key = `${msgContent.subject}|${msgContent.receivedDateTime}`;
                        if (existingKeys.has(key)) continue;


                        const newMessage = {
                            subject: msgContent.subject,
                            body: msgContent.body,
                            from: msgContent.from,
                            toRecipients: msgContent.toRecipients,
                            ccRecipients: msgContent.ccRecipients,
                            bccRecipients: msgContent.bccRecipients,
                            importance: msgContent.importance,
                            isRead: msgContent.isRead,
                            isDraft: false,
                            internetMessageId: msgContent.internetMessageId,
                            attachments: msgContent.attachments?.map((a: any) => {
                                // Clean attachment for import
                                const { id, lastModifiedDateTime, ...cleanA } = a;
                                return cleanA;
                            }) || [],
                            singleValueExtendedProperties: [
                                // PR_MESSAGE_DELIVERY_TIME (Received Date)
                                { id: "SystemTime 0x0E06", value: msgContent.receivedDateTime },
                                // PR_CLIENT_SUBMIT_TIME (Sent Date)
                                { id: "SystemTime 0x0039", value: msgContent.sentDateTime || msgContent.receivedDateTime },
                                // PR_CREATION_TIME
                                { id: "SystemTime 0x3007", value: msgContent.createdDateTime || msgContent.receivedDateTime },
                                // PR_MESSAGE_FLAGS (0x0E07)
                                {
                                    id: "Integer 0x0E07",
                                    value: (
                                        (msgContent.isRead ? 1 : 0) |
                                        (msgContent.hasAttachments ? 16 : 0)
                                    ).toString()
                                }
                            ]
                        };

                        await this.safePostMessage(userId, remoteFolder.id, newMessage);
                        this.stats.emails++;
                        onProgress({
                            message: `Correo importado: ${msgContent.subject}`,
                            type: 'success',
                            label: `Importando correos... (${this.stats.emails})`
                        });
                    } catch (msgErr: any) {
                        onProgress({ message: `Error en mensaje ${msgFile}: ${msgErr.message}`, type: 'warning' });
                    }
                }
            } catch (e: any) {
                // Folder level errors (e.g. create folder failed or list messages failed)
                onProgress({ message: `Error procesando carpeta ${folderName}: ${e.message}`, type: 'warning' });
            }
        }
    }

    private async safePostMessage(userId: string, folderId: string, message: any): Promise<void> {
        try {
            await this.client.api(`/users/${userId}/mailFolders/${folderId}/messages`).post(message);
        } catch (e: any) {
            // Case 1: Too large (limit 4MB for inline attachments)
            if (e.statusCode === 413 || e.message.includes('too large') || e.message.includes('LimitExceeded')) {
                const { attachments, ...simplifiedMessage } = message;
                // Retry without attachments but keeping extended properties
                await this.client.api(`/users/${userId}/mailFolders/${folderId}/messages`).post(simplifiedMessage);
                return;
            }

            // Case 2: Read-only issues with extended properties
            if (e.message.includes('Item save operation did not succeed') && message.singleValueExtendedProperties) {
                const { singleValueExtendedProperties, ...simplifiedMessage } = message;
                await this.client.api(`/users/${userId}/mailFolders/${folderId}/messages`).post(simplifiedMessage);
                return;
            }

            throw e;
        }
    }

    private async importContacts(userId: string, contactsRelPath: string, onProgress: (p: MigrationProgress) => void, signal?: AbortSignal) {
        const fileRelPath = path.join(contactsRelPath, 'contacts.json');
        if (!await this.storage.exists(fileRelPath)) return;

        try {
            const buffer = await this.storage.readFile(fileRelPath);
            const contacts = JSON.parse(buffer.toString('utf8'));
            const existingContacts = await this.pagedCollect(`/users/${userId}/contacts?$select=emailAddresses`);
            const existingEmails = new Set(existingContacts.flatMap(c => c.emailAddresses.map((a: any) => a.address.toLowerCase())));

            for (const contact of contacts) {
                if (signal?.aborted) return;
                const contactEmail = contact.emailAddresses[0]?.address?.toLowerCase();
                if (contactEmail && existingEmails.has(contactEmail)) continue;

                const { id, ...cleanContact } = contact;
                await this.client.api(`/users/${userId}/contacts`).post(cleanContact);
                this.stats.contacts++;
                onProgress({ message: `Contacto importado: ${contact.displayName}`, type: 'success', label: `Importando contactos... (${this.stats.contacts})` });
            }
        } catch (e: any) {
            if (e.statusCode === 403) {
                onProgress({ message: `Faltan permisos para importar Contactos. Añade 'Contacts.ReadWrite' al App Registration.`, type: 'error' });
            } else {
                onProgress({ message: `Error importando contactos: ${e.message}`, type: 'warning' });
            }
        }
    }

    private async importRules(userId: string, rulesRelPath: string, onProgress: (p: MigrationProgress) => void, signal?: AbortSignal) {
        const fileRelPath = path.join(rulesRelPath, 'rules.json');
        if (!await this.storage.exists(fileRelPath)) return;

        try {
            const buffer = await this.storage.readFile(fileRelPath);
            const rules = JSON.parse(buffer.toString('utf8'));

            let existingRules;
            try {
                existingRules = await this.client.api(`/users/${userId}/mailFolders/inbox/messageRules`).get();
            } catch (e) {
                onProgress({ message: `No se pudieron leer reglas existentes (¿usuario sin buzón?)`, type: 'warning' });
                return;
            }

            const existingNames = new Set(existingRules.value?.map((r: any) => r.displayName) || []);

            for (const rule of rules) {
                if (signal?.aborted) return;
                if (existingNames.has(rule.displayName)) {
                    onProgress({ message: `Regla ya existe: ${rule.displayName}`, type: 'info' });
                    continue;
                }

                const { id, isReadOnly, ...cleanRule } = rule;

                try {
                    await this.client.api(`/users/${userId}/mailFolders/inbox/messageRules`).post(cleanRule);
                    this.stats.rules++;
                    onProgress({ message: `Regla importada: ${rule.displayName}`, type: 'success', label: `Importando reglas...` });
                } catch (ruleErr: any) {
                    onProgress({ message: `Error en regla ${rule.displayName}: ${ruleErr.message}`, type: 'warning' });
                }
            }
        } catch (e: any) {
            if (e.statusCode === 403) {
                onProgress({ message: `Faltan permisos para importar Reglas (MailboxSettings.ReadWrite).`, type: 'error' });
            } else {
                onProgress({ message: `Error importando reglas: ${e.message}`, type: 'warning' });
            }
        }
    }

    private async uploadToDrive(ownerId: string, parentItemId: string, localRelPath: string, onProgress: (p: MigrationProgress) => void, isSite: boolean = false, signal?: AbortSignal) {
        const rawItems = await this.storage.readdir(localRelPath);
        const items = rawItems.filter(i => !i.name.endsWith('.metadata.json'));

        const endpoint = isSite ? `/sites/${ownerId}/drive/items/${parentItemId}/children` : `/users/${ownerId}/drive/items/${parentItemId}/children`;
        const existingItems = await this.pagedCollect(endpoint);
        const existingMap = new Map(existingItems.map(i => [i.name, i]));

        for (const item of items) {
            if (signal?.aborted) return;
            const itemName = item.name;
            if (itemName.startsWith('.')) continue;
            const itemRelPath = path.join(localRelPath, itemName);

            if (item.isDir) {
                let folder = existingMap.get(itemName);
                if (!folder) {
                    try {
                        folder = await this.client.api(endpoint).post({
                            name: itemName,
                            folder: {},
                        });
                        this.stats.folders++;
                        onProgress({ message: `Carpeta creada: ${itemName}`, type: 'success', label: `Procesando estructuras...` });
                    } catch (e) {
                        onProgress({ message: `Fallo al crear carpeta ${itemName}`, type: 'warning' });
                        continue;
                    }
                }
                await this.uploadToDrive(ownerId, folder.id, itemRelPath, onProgress, isSite, signal);
            } else {
                const putEndpoint = isSite ? `/sites/${ownerId}/drive/items/${parentItemId}:/${encodeURIComponent(itemName)}:/content` : `/users/${ownerId}/drive/items/${parentItemId}:/${encodeURIComponent(itemName)}:/content`;

                try {
                    const existing = existingMap.get(itemName);
                    const mtime = await this.storage.getMTime(itemRelPath);
                    if (existing) {
                        const remoteDate = new Date(existing.lastModifiedDateTime);
                        if (mtime && mtime <= remoteDate) continue;
                    }

                    const fileContent = await this.storage.readFile(itemRelPath);
                    const uploadedItem = await this.client.api(putEndpoint).put(fileContent);
                    this.stats.files++;
                    onProgress({ message: `Elemento subido: ${itemName}`, type: 'success', label: `Transfiriendo archivos... (${this.stats.files})` });

                    const metaRelPath = `${itemRelPath}.metadata.json`;
                    if (await this.storage.exists(metaRelPath)) {
                        try {
                            const metaBuffer = await this.storage.readFile(metaRelPath);
                            const meta = JSON.parse(metaBuffer.toString('utf8'));
                            const patchEndpoint = isSite ? `/sites/${ownerId}/drive/items/${uploadedItem.id}` : `/users/${ownerId}/drive/items/${uploadedItem.id}/driveItem`;

                            // Note: for users we sometimes need to target /drive/items/{id} or /drive/root:/{path}
                            // but usually /users/{id}/drive/items/{item-id} works.
                            // We use fileSystemInfo to preserve original dates.
                            await this.client.api(isSite ? `/sites/${ownerId}/drive/items/${uploadedItem.id}` : `/users/${ownerId}/drive/items/${uploadedItem.id}`).patch({
                                fileSystemInfo: {
                                    createdDateTime: meta.createdDateTime,
                                    lastModifiedDateTime: meta.lastModifiedDateTime
                                }
                            });
                        } catch (e: any) {
                            console.error(`Error patching metadata for ${itemName}:`, e.message);
                        }
                    }
                } catch (e: any) {
                    onProgress({ message: `Error subiendo ${itemName}: ${e.message}`, type: 'warning' });
                }
            }
        }
    }

    getSummary() {
        return `RESUMEN DE IMPORTACIÓN:
- Correos: ${this.stats.emails}
- Contactos: ${this.stats.contacts}
- Reglas: ${this.stats.rules}
- Archivos subidos: ${this.stats.files}
- Carpetas creadas: ${this.stats.folders}`;
    }

    getStats() {
        return { ...this.stats, total: this.totals };
    }
}
