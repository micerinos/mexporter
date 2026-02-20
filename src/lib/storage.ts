import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand, HeadObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { StorageConfig } from './types';

export interface StorageItem {
    name: string;
    isDir: boolean;
}

export interface IStorage {
    exists(relativePath: string): Promise<boolean>;
    mkdir(relativePath: string): Promise<void>;
    writeFile(relativePath: string, content: Buffer | string): Promise<void>;
    readFile(relativePath: string): Promise<Buffer>;
    readdir(relativePath: string): Promise<StorageItem[]>;
    rm(relativePath: string): Promise<void>;
    getMTime(relativePath: string): Promise<Date | null>;
    getAbsolutePath(relativePath: string): string;
}

export class LocalStorage implements IStorage {
    private basePath: string;

    constructor(basePath: string) {
        this.basePath = path.resolve(basePath);
        if (!fs.existsSync(this.basePath)) {
            fs.mkdirSync(this.basePath, { recursive: true });
        }
    }

    async exists(relativePath: string): Promise<boolean> {
        return fs.existsSync(path.join(this.basePath, relativePath));
    }

    async mkdir(relativePath: string): Promise<void> {
        fs.mkdirSync(path.join(this.basePath, relativePath), { recursive: true });
    }

    async writeFile(relativePath: string, content: Buffer | string): Promise<void> {
        const fullPath = path.join(this.basePath, relativePath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content);
    }

    async readFile(relativePath: string): Promise<Buffer> {
        return fs.readFileSync(path.join(this.basePath, relativePath));
    }

    async readdir(relativePath: string): Promise<StorageItem[]> {
        const fullPath = path.join(this.basePath, relativePath);
        if (!fs.existsSync(fullPath)) return [];
        const files = fs.readdirSync(fullPath);
        return files.map(name => {
            const stats = fs.statSync(path.join(fullPath, name));
            return {
                name,
                isDir: stats.isDirectory()
            };
        });
    }

    async rm(relativePath: string): Promise<void> {
        const fullPath = path.join(this.basePath, relativePath);
        if (fs.existsSync(fullPath)) {
            fs.rmSync(fullPath, { recursive: true, force: true });
        }
    }

    async getMTime(relativePath: string): Promise<Date | null> {
        const fullPath = path.join(this.basePath, relativePath);
        if (!fs.existsSync(fullPath)) return null;
        return fs.statSync(fullPath).mtime;
    }

    getAbsolutePath(relativePath: string): string {
        return path.join(this.basePath, relativePath);
    }
}

export class S3Storage implements IStorage {
    private client: S3Client;
    private bucket: string;

    constructor(config: StorageConfig) {
        this.client = new S3Client({
            region: config.s3Region,
            credentials: {
                accessKeyId: config.s3AccessKey!,
                secretAccessKey: config.s3SecretKey!
            }
        });
        this.bucket = config.s3Bucket!;
    }

    private normalizeKey(key: string): string {
        if (!key) return '';
        // S3 keys should not start with / and should use / as separator
        // Replace backslashes and remove leading slashes
        let normalized = key.replace(/\\/g, '/').replace(/^\/+/, '');
        // Collapse multiple slashes
        normalized = normalized.replace(/\/+/g, '/');
        return normalized;
    }

    async exists(relativePath: string): Promise<boolean> {
        const key = this.normalizeKey(relativePath);
        if (!key) return true; // Root exists

        try {
            await this.client.send(new HeadObjectCommand({
                Bucket: this.bucket,
                Key: key
            }));
            return true;
        } catch (e: any) {
            if (e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404) {
                // If not an exact object, check if it's a "folder" prefix
                try {
                    const prefix = key.endsWith('/') ? key : `${key}/`;
                    const listRes = await this.client.send(new ListObjectsV2Command({
                        Bucket: this.bucket,
                        Prefix: prefix,
                        MaxKeys: 1
                    }));
                    return (listRes.Contents?.length || 0) > 0 || (listRes.CommonPrefixes?.length || 0) > 0;
                } catch (listErr) {
                    return false;
                }
            }
            // For 403 Forbidden or other errors, we assume it might exist but we can't see it,
            // or we return false to trigger a re-download/write safely.
            return false;
        }
    }

    async mkdir(relativePath: string): Promise<void> {
        const key = this.normalizeKey(relativePath);
        if (!key) return;

        // S3 folders are typically represented by a zero-byte object with a trailing slash
        const folderKey = key.endsWith('/') ? key : `${key}/`;

        await this.client.send(new PutObjectCommand({
            Bucket: this.bucket,
            Key: folderKey,
            Body: ''
        }));
    }

    async writeFile(relativePath: string, content: Buffer | string): Promise<void> {
        const key = this.normalizeKey(relativePath);
        await this.client.send(new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: content
        }));
    }

    async readFile(relativePath: string): Promise<Buffer> {
        const key = this.normalizeKey(relativePath);
        const res = await this.client.send(new GetObjectCommand({
            Bucket: this.bucket,
            Key: key
        }));
        const bytes = await res.Body?.transformToByteArray();
        return Buffer.from(bytes!);
    }

    async readdir(relativePath: string): Promise<StorageItem[]> {
        const key = this.normalizeKey(relativePath);
        const prefix = key ? (key.endsWith('/') ? key : `${key}/`) : '';

        const items: StorageItem[] = [];
        let continuationToken: string | undefined;

        do {
            const res = await this.client.send(new ListObjectsV2Command({
                Bucket: this.bucket,
                Prefix: prefix,
                Delimiter: '/',
                ContinuationToken: continuationToken
            }));

            // Add directories (CommonPrefixes)
            if (res.CommonPrefixes) {
                for (const cp of res.CommonPrefixes) {
                    if (cp.Prefix) {
                        const name = cp.Prefix.slice(prefix.length).replace(/\/$/, '');
                        if (name) items.push({ name, isDir: true });
                    }
                }
            }

            // Add files (Contents)
            if (res.Contents) {
                for (const obj of res.Contents) {
                    if (obj.Key) {
                        const name = obj.Key.slice(prefix.length);
                        // Skip the prefix itself, and skip folder placeholders (ending in /)
                        if (name && name !== '/' && !name.endsWith('/')) {
                            items.push({ name, isDir: false });
                        }
                    }
                }
            }

            continuationToken = res.NextContinuationToken;
        } while (continuationToken);

        return items;
    }

    async rm(relativePath: string): Promise<void> {
        const key = this.normalizeKey(relativePath);
        const prefix = key.endsWith('/') ? key : `${key}/`;

        // List all objects with this prefix and delete them
        let continuationToken: string | undefined;
        do {
            const listRes = await this.client.send(new ListObjectsV2Command({
                Bucket: this.bucket,
                Prefix: prefix,
                ContinuationToken: continuationToken
            }));

            if (listRes.Contents && listRes.Contents.length > 0) {
                await this.client.send(new DeleteObjectsCommand({
                    Bucket: this.bucket,
                    Delete: {
                        Objects: listRes.Contents.map(obj => ({ Key: obj.Key }))
                    }
                }));
            }

            // Also delete the specific key itself if it wasn't caught by the prefix list
            await this.client.send(new DeleteObjectCommand({
                Bucket: this.bucket,
                Key: key
            })).catch(() => { });

            continuationToken = listRes.NextContinuationToken;
        } while (continuationToken);
    }

    async getMTime(relativePath: string): Promise<Date | null> {
        const key = this.normalizeKey(relativePath);
        if (!key) return null;

        try {
            const res = await this.client.send(new HeadObjectCommand({
                Bucket: this.bucket,
                Key: key
            }));
            return res.LastModified || null;
        } catch (e) {
            // Try with trailing slash (folder marker)
            try {
                const res = await this.client.send(new HeadObjectCommand({
                    Bucket: this.bucket,
                    Key: key.endsWith('/') ? key : `${key}/`
                }));
                return res.LastModified || null;
            } catch (e2) {
                return null;
            }
        }
    }

    getAbsolutePath(relativePath: string): string {
        return `s3://${this.bucket}/${relativePath}`;
    }
}

export function getStorage(config: StorageConfig): IStorage {
    if (config.type === 's3') {
        return new S3Storage(config);
    }
    return new LocalStorage(config.localPath || './exports');
}
