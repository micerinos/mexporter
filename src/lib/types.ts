export interface TenantConfig {
    name: string;
    tenantId: string;
    clientId: string;
    clientSecret: string;
}

export type StorageType = 'local' | 's3';

export interface StorageConfig {
    type: StorageType;
    localPath?: string;
    s3Bucket?: string;
    s3Region?: string;
    s3AccessKey?: string;
    s3SecretKey?: string;
}

export interface AppConfig {
    source: TenantConfig;
    dest: TenantConfig;
    storage: StorageConfig;
}
