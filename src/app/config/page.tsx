"use client";

import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, RefreshCw, ShieldCheck, Zap, Database, HardDrive, Cloud, Download, Upload, Trash2 } from 'lucide-react';
import { StorageConfig } from '@/lib/types';

export interface TenantConfig {
    id: string;
    name: string;
    tenantId: string;
    clientId: string;
    clientSecret: string;
}

const TenantForm = ({ title, config, setConfig, icon: Icon, profiles, activeId, setActiveId, onAdd, onDelete }: any) => (
    <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                <Icon size={20} color="var(--primary)" />
                {title}
            </h3>
            <button className="btn-outline" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }} onClick={onAdd}>+ Añadir</button>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <select
                className="input"
                value={activeId}
                onChange={e => setActiveId(e.target.value)}
                style={{ flex: 1, fontSize: '0.85rem' }}
            >
                {profiles.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name || 'Sin nombre'}</option>
                ))}
            </select>
            <button
                className="btn-outline"
                style={{ color: 'var(--error)', borderColor: 'rgba(215,0,0,0.1)', padding: '0.6rem' }}
                onClick={() => onDelete(activeId)}
                disabled={profiles.length <= 1}
            >
                <Trash2 size={16} />
            </button>
        </div>

        <div style={{ display: 'grid', gap: '1rem', padding: '1rem', background: 'rgba(0,0,0,0.02)', borderRadius: 'var(--radius)' }}>
            <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>Nombre del Perfil (Cliente)</label>
                <input
                    className="input"
                    value={config.name}
                    onChange={e => setConfig(config.id, { name: e.target.value })}
                    placeholder="Ej: Cliente Pro"
                />
            </div>
            <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>ID del Tenant</label>
                <input
                    className="input"
                    value={config.tenantId}
                    onChange={e => setConfig(config.id, { tenantId: e.target.value })}
                    placeholder="00000000-0000..."
                />
            </div>
            <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>Client ID</label>
                <input
                    className="input"
                    value={config.clientId}
                    onChange={e => setConfig(config.id, { clientId: e.target.value })}
                    placeholder="0000..."
                />
            </div>
            <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>Client Secret</label>
                <input
                    type="password"
                    className="input"
                    value={config.clientSecret}
                    onChange={e => setConfig(config.id, { clientSecret: e.target.value })}
                    placeholder="••••••••"
                />
            </div>
        </div>
    </div>
);

export default function ConfigPage() {
    const [sources, setSources] = useState<TenantConfig[]>([{
        id: 'source-default',
        name: 'Cliente A (Origen)',
        tenantId: '',
        clientId: '',
        clientSecret: ''
    }]);

    const [dests, setDests] = useState<TenantConfig[]>([{
        id: 'dest-default',
        name: 'Destino Standard',
        tenantId: '',
        clientId: '',
        clientSecret: ''
    }]);

    const [activeSourceId, setActiveSourceId] = useState<string>('source-default');
    const [activeDestId, setActiveDestId] = useState<string>('dest-default');

    const source = sources.find(s => s.id === activeSourceId) || sources[0];
    const dest = dests.find(d => d.id === activeDestId) || dests[0];

    const [storage, setStorage] = useState<StorageConfig>({
        type: 'local',
        localPath: './exports',
        s3Bucket: '',
        s3Region: 'us-east-1',
        s3AccessKey: '',
        s3SecretKey: ''
    });

    const [saved, setSaved] = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem('m365_migration_config');
        if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed.sources) setSources(parsed.sources);
            if (parsed.dests) setDests(parsed.dests);
            if (parsed.activeSourceId) setActiveSourceId(parsed.activeSourceId);
            if (parsed.activeDestId) setActiveDestId(parsed.activeDestId);
            if (parsed.storage) setStorage(parsed.storage);

            // Backward compatibility
            if (!parsed.sources && parsed.source) {
                setSources([{ ...parsed.source, id: 'source-default' }]);
                setActiveSourceId('source-default');
            }
            if (!parsed.dests && parsed.dest) {
                setDests([{ ...parsed.dest, id: 'dest-default' }]);
                setActiveDestId('dest-default');
            }
        }
    }, []);

    const handleSave = () => {
        const config = {
            sources,
            dests,
            activeSourceId,
            activeDestId,
            source, // Save current for backward compatibility
            dest,   // Save current for backward compatibility
            storage
        };
        localStorage.setItem('m365_migration_config', JSON.stringify(config));
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
    };

    const addSource = () => {
        const newId = `source-${Date.now()}`;
        setSources([...sources, { id: newId, name: 'Nuevo Cliente', tenantId: '', clientId: '', clientSecret: '' }]);
        setActiveSourceId(newId);
    };

    const addDest = () => {
        const newId = `dest-${Date.now()}`;
        setDests([...dests, { id: newId, name: 'Nuevo Destino', tenantId: '', clientId: '', clientSecret: '' }]);
        setActiveDestId(newId);
    };

    const deleteProfile = (type: 'source' | 'dest', id: string) => {
        if (type === 'source') {
            if (sources.length <= 1) return;
            const updated = sources.filter(s => s.id !== id);
            setSources(updated);
            if (activeSourceId === id) setActiveSourceId(updated[0].id);
        } else {
            if (dests.length <= 1) return;
            const updated = dests.filter(d => d.id !== id);
            setDests(updated);
            if (activeDestId === id) setActiveDestId(updated[0].id);
        }
    };

    const updateProfile = (type: 'source' | 'dest', id: string, data: Partial<TenantConfig>) => {
        if (type === 'source') {
            setSources(sources.map(s => s.id === id ? { ...s, ...data } : s));
        } else {
            setDests(dests.map(d => d.id === id ? { ...d, ...data } : d));
        }
    };

    const handleDownloadConfig = () => {
        const config = { source, dest, storage };
        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'm365-migration-config.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleUploadConfig = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target?.result as string;
                const parsed = JSON.parse(content);

                if (parsed.sources) setSources(parsed.sources);
                if (parsed.dests) setDests(parsed.dests);
                if (parsed.activeSourceId) setActiveSourceId(parsed.activeSourceId);
                if (parsed.activeDestId) setActiveDestId(parsed.activeDestId);
                if (parsed.storage) setStorage(parsed.storage);

                // Backward compatibility for single-profile files
                if (!parsed.sources && parsed.source) {
                    const newSource = { ...parsed.source, id: 'source-upload' };
                    setSources([newSource]);
                    setActiveSourceId('newSource');
                }

                localStorage.setItem('m365_migration_config', content);
                setSaved(true);
                setTimeout(() => setSaved(false), 3000);
            } catch (err) {
                alert('Error al leer el archivo de configuración. Asegúrate de que es un JSON válido.');
            }
        };
        reader.readAsText(file);
    };

    return (
        <div className="container animate-fadeIn">
            <header style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Configuración</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Gestiona las credenciales y el almacenamiento de la migración</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <label className="btn-outline" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Upload size={16} />
                        Cargar Config
                        <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleUploadConfig} />
                    </label>
                    <button className="btn-outline" onClick={handleDownloadConfig} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Download size={16} />
                        Exportar
                    </button>
                    <button className="btn-primary" onClick={handleSave}>
                        <Save size={18} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
                        Guardar Configuración
                    </button>
                </div>
            </header>

            {saved && (
                <div style={{ background: 'var(--success)', color: 'white', padding: '1rem', borderRadius: 'var(--radius)', marginBottom: '1.5rem', textAlign: 'center' }}>
                    Configuración guardada correctamente en el almacenamiento local.
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                <TenantForm
                    title="Perfiles de Origen"
                    config={source}
                    setConfig={(id: string, data: any) => updateProfile('source', id, data)}
                    icon={ShieldCheck}
                    profiles={sources}
                    activeId={activeSourceId}
                    setActiveId={setActiveSourceId}
                    onAdd={addSource}
                    onDelete={(id: string) => deleteProfile('source', id)}
                />
                <TenantForm
                    title="Perfiles de Destino"
                    config={dest}
                    setConfig={(id: string, data: any) => updateProfile('dest', id, data)}
                    icon={Zap}
                    profiles={dests}
                    activeId={activeDestId}
                    setActiveId={setActiveDestId}
                    onAdd={addDest}
                    onDelete={(id: string) => deleteProfile('dest', id)}
                />
            </div>

            {/* Storage Configuration */}
            <div className="glass-card" style={{ marginTop: '2rem', padding: '1.5rem' }}>
                <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Database size={20} color="var(--primary)" />
                    Destino de Exportaciones
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: '2rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <button
                            className={storage.type === 'local' ? "btn-primary" : "btn-outline"}
                            onClick={() => setStorage({ ...storage, type: 'local' })}
                            style={{ justifyContent: 'flex-start', padding: '1rem' }}
                        >
                            <HardDrive size={18} style={{ marginRight: '0.5rem' }} />
                            Servidor Local
                        </button>
                        <button
                            className={storage.type === 's3' ? "btn-primary" : "btn-outline"}
                            onClick={() => setStorage({ ...storage, type: 's3' })}
                            style={{ justifyContent: 'flex-start', padding: '1rem' }}
                        >
                            <Cloud size={18} style={{ marginRight: '0.5rem' }} />
                            Amazon S3 Bucket
                        </button>
                    </div>

                    <div style={{ display: 'grid', gap: '1rem' }}>
                        {storage.type === 'local' ? (
                            <div>
                                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Ruta en el Servidor</label>
                                <input
                                    className="input"
                                    value={storage.localPath}
                                    onChange={e => setStorage({ ...storage, localPath: e.target.value })}
                                    placeholder="./exports"
                                />
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
                                    Ruta absoluta o relativa donde se guardarán los ficheros.
                                </p>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div style={{ gridColumn: 'span 2' }}>
                                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Nombre del Bucket</label>
                                    <input
                                        className="input"
                                        value={storage.s3Bucket}
                                        onChange={e => setStorage({ ...storage, s3Bucket: e.target.value })}
                                        placeholder="mi-bucket-m365"
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Región</label>
                                    <input
                                        className="input"
                                        value={storage.s3Region}
                                        onChange={e => setStorage({ ...storage, s3Region: e.target.value })}
                                        placeholder="us-east-1"
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Access Key ID</label>
                                    <input
                                        className="input"
                                        value={storage.s3AccessKey}
                                        onChange={e => setStorage({ ...storage, s3AccessKey: e.target.value })}
                                        placeholder="AKIA..."
                                    />
                                </div>
                                <div style={{ gridColumn: 'span 2' }}>
                                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Secret Access Key</label>
                                    <input
                                        type="password"
                                        className="input"
                                        value={storage.s3SecretKey}
                                        onChange={e => setStorage({ ...storage, s3SecretKey: e.target.value })}
                                        placeholder="••••••••••••••••"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="glass-card" style={{ marginTop: '2rem', padding: '1.5rem', borderLeft: '4px solid var(--warning)' }}>
                <h4 style={{ marginBottom: '0.5rem' }}>Información importante</h4>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    Esta configuración se guarda en el almacenamiento local de tu navegador.
                    Asegúrate de que la aplicación registrada en Azure tenga los permisos necesarios (Application Permissions) para lectura en el origen y escritura en el destino.
                </p>
            </div>
        </div>
    );
}
