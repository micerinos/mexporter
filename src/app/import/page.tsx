"use client";

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    Download,
    Settings,
    Search,
    HardDrive,
    Mail,
    Box,
    ChevronRight,
    FolderOpen,
    CheckCircle2,
    Clock,
    Contact2,
    BarChart3,
    Play,
    Terminal,
    X,
    Trash2,
    ShieldCheck,
    AlertTriangle
} from 'lucide-react';

interface ExportedItem {
    name: string;
    type: 'user' | 'site';
    path: string;
    upn?: string;
    exportDate?: string;
    contents?: {
        hasEmails: boolean;
        hasOneDrive: boolean;
        hasContacts: boolean;
        hasRules: boolean;
        libraries: string[];
    };
    tenant?: string;
    importStatus?: {
        status: 'running' | 'completed';
        endTime?: string;
        target?: string;
    };
}

export default function ImportPage() {
    const [exportedItems, setExportedItems] = useState<ExportedItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedItems, setSelectedItems] = useState<ExportedItem[]>([]);
    const [targetId, setTargetId] = useState('');
    const [destUsers, setDestUsers] = useState<any[]>([]);
    const [destSites, setDestSites] = useState<any[]>([]);
    const [loadingDest, setLoadingDest] = useState(false);
    const [importSettings, setImportSettings] = useState({
        emails: true,
        contacts: true,
        rules: true,
        onedrive: true
    });
    const [isImporting, setIsImporting] = useState(false);
    const [comparisonReport, setComparisonReport] = useState<any>(null);
    const [isComparing, setIsComparing] = useState(false);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [configuringItem, setConfiguringItem] = useState<ExportedItem | null>(null);
    const [destTenantName, setDestTenantName] = useState('');
    const [sourceTenantName, setSourceTenantName] = useState('');
    const [activeType, setActiveType] = useState<'all' | 'user' | 'site'>('all');
    const [tenants, setTenants] = useState<string[]>([]);
    const [selectedTenant, setSelectedTenant] = useState<string>('all');
    const [mounted, setMounted] = useState(false);
    const [tasks, setTasks] = useState<any[]>([]);
    const [viewingTask, setViewingTask] = useState<any | null>(null);
    const [historyItem, setHistoryItem] = useState<any | null>(null);
    const [showLogs, setShowLogs] = useState(false);

    useEffect(() => {
        setMounted(true);
        fetchExportedData();
        fetchDestinationData();

        const configStr = localStorage.getItem('m365_migration_config');
        if (configStr) {
            const { dest, source } = JSON.parse(configStr);
            if (dest?.name) setDestTenantName(dest.name);
            if (source?.name) setSourceTenantName(source.name);
        }
    }, []);

    useEffect(() => {
        const interval = setInterval(fetchTasks, 2000);
        return () => clearInterval(interval);
    }, [`${viewingTask?.id}-${viewingTask?.status}`]);

    const fetchTasks = async () => {
        try {
            const res = await fetch('/api/tasks');
            const data = await res.json();
            setTasks(data);

            if (viewingTask && viewingTask.status === 'running') {
                const current = data.find((t: any) => t.id === viewingTask.id);
                if (current) setViewingTask(current);
            }
        } catch (e) { }
    };

    const fetchDestinationData = async () => {
        const configStr = localStorage.getItem('m365_migration_config');
        if (!configStr) return;
        const { dest, source } = JSON.parse(configStr);
        if (!dest || !dest.tenantId) return;

        setLoadingDest(true);
        try {
            const [uRes, sRes, tDestRes, tSourceRes] = await Promise.all([
                fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: dest }) }),
                fetch('/api/sites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: dest }) }),
                fetch('/api/tenant-info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: dest }) }),
                fetch('/api/tenant-info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: source }) })
            ]);
            const uData = await uRes.json();
            const sData = await sRes.json();
            const tDestData = await tDestRes.json();
            const tSourceData = await tSourceRes.json();

            if (Array.isArray(uData)) setDestUsers(uData);
            if (Array.isArray(sData)) setDestSites(sData);

            if (dest?.name) setDestTenantName(dest.name);
            else if (tDestData.displayName) setDestTenantName(tDestData.displayName);

            if (source?.name) setSourceTenantName(source.name);
            else if (tSourceData.displayName) setSourceTenantName(tSourceData.displayName);
        } catch (e) {
            console.error("Error fetching destination", e);
        } finally {
            setLoadingDest(false);
        }
    };

    const fetchExportedData = async () => {
        setLoading(true);
        const configStr = localStorage.getItem('m365_migration_config');
        if (!configStr) {
            setLoading(false);
            return;
        }
        const { storage } = JSON.parse(configStr);

        try {
            const response = await fetch('/api/export-list', {
                method: 'POST',
                body: JSON.stringify({ storageConfig: storage })
            });
            const data = await response.json();
            if (Array.isArray(data)) {
                setExportedItems(data);
                const uniqueTenants = Array.from(new Set(data.map((item: any) => item.tenant).filter(Boolean))) as string[];
                setTenants(uniqueTenants);
            }
        } catch (e) {
            console.error("Error listing exports", e);
        } finally {
            setLoading(false);
        }
    };

    const handleStartImport = async (specificItem?: ExportedItem) => {
        const itemToProcess = specificItem || configuringItem;
        const items = itemToProcess ? [itemToProcess] : selectedItems;

        if (items.length === 0) return;

        // If it's a single item and we don't have a target yet, open modal
        if (items.length === 1 && !targetId) {
            setConfiguringItem(items[0]);
            setTargetId(items[0].upn || items[0].name || '');
            setIsSettingsModalOpen(true);
            return;
        }

        const configStr = localStorage.getItem('m365_migration_config');
        if (!configStr) return;
        const { dest, storage } = JSON.parse(configStr);

        setIsImporting(true);
        setIsSettingsModalOpen(false); // Close if opened
        try {
            for (const item of items) {
                let finalTarget = targetId;
                if (!finalTarget || items.length > 1) {
                    finalTarget = item.upn || item.name;
                }

                await fetch('/api/import', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        item,
                        targetId: finalTarget,
                        destinationConfig: dest,
                        settings: importSettings,
                        storageConfig: storage
                    })
                });
            }
            setSelectedItems([]);
            setTargetId('');
            setConfiguringItem(null);
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        } finally {
            setIsImporting(false);
        }
    };

    const handleCompare = async (item: ExportedItem) => {
        const configStr = localStorage.getItem('m365_migration_config');
        if (!configStr) return;
        const { dest, storage, source } = JSON.parse(configStr);

        // Destination is always 'dest' if available, otherwise fallback to 'source'
        const targetId = item.importStatus?.target || item.upn || item.name;
        const targetConfig = dest || source;

        setIsComparing(true);
        try {
            const response = await fetch('/api/compare', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    item,
                    targetId: targetId,
                    destinationConfig: targetConfig,
                    storageConfig: storage,
                    sourceConfig: source
                })
            });

            let data;
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
                data = await response.json();
            } else {
                const text = await response.text();
                throw new Error(`Error del servidor: ${text.substring(0, 100)}...`);
            }

            if (data.error) throw new Error(data.error);
            setComparisonReport(data);
        } catch (error: any) {
            alert(`Error en reporte: ${error.message}`);
        } finally {
            setIsComparing(false);
        }
    };

    const handleDeleteExport = async (item: ExportedItem) => {
        if (!confirm(`¿Eliminar backup de ${item.name}?`)) return;
        const configStr = localStorage.getItem('m365_migration_config');
        if (!configStr) return;
        const { storage } = JSON.parse(configStr);

        try {
            await fetch('/api/export-list', {
                method: 'POST',
                body: JSON.stringify({ action: 'delete', itemPath: item.path, storageConfig: storage })
            });
            fetchExportedData();
        } catch (e) {
            alert("Error al eliminar");
        }
    };

    const filteredItems = exportedItems.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesType = activeType === 'all' || item.type === activeType;
        const matchesTenant = selectedTenant === 'all' || item.tenant === selectedTenant;
        return matchesSearch && matchesType && matchesTenant;
    });

    return (
        <>
            <div className="container animate-fadeIn" style={{ maxWidth: '1400px' }}>
                <header style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h1 style={{ fontSize: '1.8rem', marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            Importación de Backups
                            <span className="badge" style={{ fontSize: '0.75rem', background: 'var(--success)', color: 'white' }}>Destino: {destTenantName}</span>
                        </h1>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Restaura datos desde el almacenamiento al tenant de destino</p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                        <button className="btn-outline" onClick={() => setIsSettingsModalOpen(true)} title="Ajustes de Restauración" style={{ padding: '0.6rem' }}>
                            <Settings size={20} />
                        </button>
                        <button className="btn-primary" onClick={() => handleStartImport()} disabled={isImporting || selectedItems.length === 0} style={{ padding: '0.6rem 1.2rem', gap: '0.5rem', display: 'flex', alignItems: 'center' }}>
                            <Download size={18} style={{ transform: 'rotate(180deg)' }} />
                            {isImporting ? '...' : selectedItems.length > 0 ? `Importar (${selectedItems.length})` : 'Importar Seleccionados'}
                        </button>
                    </div>
                </header>

                {(mounted && isComparing) && createPortal(
                    <div className="modal-overlay" style={{ zIndex: 110000 }}>
                        <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', color: 'white', background: 'rgba(0,0,0,0.8)' }}>
                            <div className="animate-pulse" style={{ marginBottom: '1rem' }}>
                                <BarChart3 size={48} style={{ margin: '0 auto' }} />
                            </div>
                            <h3>Analizando Integridad...</h3>
                            <p style={{ fontSize: '0.8rem', opacity: 0.8 }}>Comparando datos locales con el destino configurado</p>
                        </div>
                    </div>,
                    document.body
                )}


                <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '1.5rem', alignItems: 'start' }}>
                    <div className="glass-card" style={{ padding: '0' }}>
                        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div className="tab-group" style={{ padding: '0.2rem', background: '#f0f0f0', borderRadius: '10px' }}>
                                <button className={`tab ${activeType === 'all' ? 'active' : ''}`} onClick={() => setActiveType('all')} style={{ padding: '0.5rem 0.8rem', fontSize: '0.8rem' }}>Todos</button>
                                <button className={`tab ${activeType === 'user' ? 'active' : ''}`} onClick={() => setActiveType('user')} style={{ padding: '0.5rem 0.8rem', fontSize: '0.8rem' }}>Usuarios</button>
                                <button className={`tab ${activeType === 'site' ? 'active' : ''}`} onClick={() => setActiveType('site')} style={{ padding: '0.5rem 0.8rem', fontSize: '0.8rem' }}>Sitios</button>
                            </div>
                            <div style={{ display: 'flex', gap: '0.6rem' }}>
                                {tenants.length > 1 && (
                                    <select className="input" style={{ width: '140px', height: '36px', fontSize: '0.8rem' }} value={selectedTenant} onChange={(e) => setSelectedTenant(e.target.value)}>
                                        <option value="all">Todos</option>
                                        {tenants.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                )}
                                <div style={{ position: 'relative', width: '180px' }}>
                                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                                    <input className="input" placeholder="Buscar backup..." style={{ paddingLeft: '2.2rem', height: '36px', fontSize: '0.8rem' }} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                                </div>
                            </div>
                        </div>

                        <div style={{ maxHeight: 'calc(100vh - 250px)', overflowY: 'auto' }}>
                            {loading ? (
                                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>Cargando backups...</div>
                            ) : filteredItems.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '5rem', color: 'var(--text-secondary)' }}>
                                    <HardDrive size={48} style={{ margin: '0 auto 1rem', opacity: 0.2 }} />
                                    <p>No se encontraron backups de exportación.</p>
                                    <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>Realiza una exportación desde el panel principal para ver los elementos aquí.</p>
                                </div>
                            ) : (
                                <table style={{ fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr>
                                            <th style={{ width: '40px' }}>
                                                <input type="checkbox" checked={filteredItems.length > 0 && filteredItems.every(fi => selectedItems.some(si => si.path === fi.path))} onChange={() => {
                                                    const allSelected = filteredItems.every(fi => selectedItems.some(si => si.path === fi.path));
                                                    if (allSelected) setSelectedItems(prev => prev.filter(si => !filteredItems.some(fi => fi.path === si.path)));
                                                    else setSelectedItems(prev => [...new Set([...prev, ...filteredItems])]);
                                                }} />
                                            </th>
                                            <th>Nombre</th>
                                            <th>Tipo</th>
                                            <th>Fecha</th>
                                            <th>Contenido</th>
                                            <th style={{ textAlign: 'center' }}>Estado</th>
                                            <th style={{ width: '120px', textAlign: 'right' }}>Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredItems.map((item, idx) => (
                                            <tr key={idx} className={selectedItems.some(si => si.path === item.path) ? 'selected' : ''} onClick={() => {
                                                const exists = selectedItems.find(i => i.path === item.path);
                                                setSelectedItems(prev => exists ? prev.filter(i => i.path !== item.path) : [...prev, item]);
                                            }} style={{ cursor: 'pointer' }}>
                                                <td onClick={(e) => e.stopPropagation()}>
                                                    <input type="checkbox" checked={selectedItems.some(si => si.path === item.path)} onChange={() => {
                                                        const exists = selectedItems.find(i => i.path === item.path);
                                                        setSelectedItems(prev => exists ? prev.filter(i => i.path !== item.path) : [...prev, item]);
                                                    }} />
                                                </td>
                                                <td>
                                                    <div style={{ fontWeight: '500' }}>{item.name}</div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{item.tenant}</div>
                                                </td>
                                                <td>
                                                    <span className={`badge ${item.type === 'user' ? 'badge-info' : 'badge-warning'}`} style={{ fontSize: '0.7rem' }}>
                                                        {item.type === 'user' ? 'Usuario' : 'Sitio'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                                                        {item.exportDate ? new Date(item.exportDate).toLocaleDateString() : '-'}
                                                    </div>
                                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                                                        {item.exportDate ? new Date(item.exportDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                                    </div>
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: '4px' }}>
                                                        {item.contents?.hasEmails && <Mail size={14} color="var(--primary)" />}
                                                        {item.contents?.hasOneDrive && <HardDrive size={14} color="var(--primary)" />}
                                                        {item.contents?.hasContacts && <Contact2 size={14} color="var(--primary)" />}
                                                    </div>
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    {(() => {
                                                        const itemTasks = tasks.filter(t =>
                                                            (t.details.item?.path === item.path || t.details.currentProgress?.itemId === item.path)
                                                        );

                                                        const activeTask = itemTasks.find(t => t.status === 'running');
                                                        if (activeTask) {
                                                            return (
                                                                <div
                                                                    style={{ display: 'inline-flex', cursor: 'pointer' }}
                                                                    onClick={(e) => { e.stopPropagation(); setViewingTask(activeTask); }}
                                                                    className="animate-pulse"
                                                                >
                                                                    <Clock size={16} color="var(--warning)" />
                                                                </div>
                                                            );
                                                        }

                                                        const latestTask = itemTasks[0];
                                                        if (!latestTask) {
                                                            return item.importStatus?.status === 'completed' ? <CheckCircle2 size={16} color="var(--success)" /> :
                                                                <div style={{ width: '12px', height: '12px', borderRadius: '50%', border: '2px solid #eee', margin: '0 auto' }} />;
                                                        }

                                                        const getIcon = () => {
                                                            switch (latestTask.status) {
                                                                case 'completed': return <CheckCircle2 size={16} color="var(--success)" />;
                                                                case 'failed': return <AlertTriangle size={16} color="var(--error)" />;
                                                                case 'cancelled': return <X size={16} color="var(--text-secondary)" />;
                                                                default: return <div style={{ width: '12px', height: '12px', borderRadius: '50%', border: '2px solid #eee', margin: '0 auto' }} />;
                                                            }
                                                        };

                                                        return (
                                                            <div
                                                                style={{ display: 'inline-flex' }}
                                                                title={latestTask.status.toUpperCase()}
                                                            >
                                                                {getIcon()}
                                                            </div>
                                                        );
                                                    })()}
                                                </td>
                                                <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'right' }}>
                                                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                                                        <button className="btn-outline" style={{ padding: '4px', color: 'var(--primary)', border: 'none' }} onClick={() => {
                                                            setConfiguringItem(item);
                                                            setTargetId(item.upn || item.name || '');
                                                            setIsSettingsModalOpen(true);
                                                        }} title="Importar">
                                                            <Play size={16} />
                                                        </button>
                                                        <button className="btn-outline" style={{ padding: '4px', color: 'var(--success)', border: 'none' }} onClick={() => handleCompare(item)} title="Análisis de Integridad">
                                                            <ShieldCheck size={16} />
                                                        </button>
                                                        <button className="btn-outline" style={{ padding: '4px', color: 'var(--error)', border: 'none' }} onClick={() => handleDeleteExport(item)} title="Eliminar Backup">
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>

                    {/* Task Sidebar */}
                    <div className="glass-card" style={{ padding: '1rem', position: 'sticky', top: '1.5rem', maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}>
                        <h3 style={{ marginBottom: '1rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <Box size={18} color="var(--primary)" /> Dashboard de Tareas
                        </h3>

                        {tasks.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                No hay tareas recientes
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                {tasks.filter((t: any) => t.type === 'import').map((task: any) => {
                                    const stats = task.details.currentProgress?.stats || {};
                                    const total = stats.total || {};

                                    return (
                                        <div
                                            key={task.id}
                                            style={{
                                                padding: '0.8rem',
                                                cursor: 'pointer',
                                                border: '1px solid var(--border)',
                                                borderLeft: `4px solid ${task.status === 'completed' ? 'var(--success)' : task.status === 'failed' ? 'var(--error)' : 'var(--warning)'}`,
                                                background: 'var(--surface)',
                                                transition: 'all 0.2s ease'
                                            }}
                                            onClick={() => {
                                                setViewingTask(task);
                                                setShowLogs(false);
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                                <div style={{ fontWeight: '600', fontSize: '0.85rem' }}>
                                                    Importación {task.id.slice(-4)}
                                                </div>
                                                <div className={`badge ${task.status === 'completed' ? 'badge-success' : task.status === 'failed' ? 'badge-error' : 'badge-warning'}`} style={{ fontSize: '0.65rem' }}>
                                                    {task.status === 'running' ? 'En curso' : task.status}
                                                </div>
                                            </div>

                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                {new Date(task.startTime).toLocaleTimeString()} {task.details.item?.name || 'Varios'}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div> {/* Grid end */}

                {/* Task Details Modal */}
                {(mounted && viewingTask) && createPortal(
                    <div className="modal-overlay" onClick={() => setViewingTask(null)}>
                        <div className="modal-content animate-fadeIn" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
                            <div className="modal-header">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <div className={`badge ${viewingTask.status === 'completed' ? 'badge-success' : viewingTask.status === 'failed' ? 'badge-error' : 'badge-warning'}`}>
                                        {viewingTask.status === 'running' ? 'En curso' : viewingTask.status}
                                    </div>
                                    <h2>Detalles de la Tarea</h2>
                                </div>
                                <button className="btn-primary" onClick={() => setViewingTask(null)}>Cerrar</button>
                            </div>

                            <div style={{ padding: '1.5rem' }}>
                                <div className="glass-card" style={{ padding: '1.2rem', marginBottom: '1.5rem' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                        <div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>ID Tarea</div>
                                            <div style={{ fontWeight: 'bold' }}>{viewingTask.id}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>Inicio</div>
                                            <div style={{ fontWeight: 'bold' }}>{new Date(viewingTask.startTime).toLocaleString()}</div>
                                        </div>
                                    </div>

                                    <div style={{ marginBottom: '1.2rem' }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '0.4rem' }}>Progreso Actual:</div>
                                        <div style={{ background: '#f5f7f9', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                            <div style={{ fontSize: '0.85rem', color: 'var(--primary)', fontWeight: '600' }}>
                                                {viewingTask.details.currentProgress?.label || 'Iniciando...'}
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div style={{ background: 'rgba(0,120,212,0.05)', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(0,120,212,0.1)' }}>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>CORREOS PROCESADOS</div>
                                            <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--primary)' }}>
                                                {viewingTask.details.currentProgress?.stats?.emails || 0}
                                                {viewingTask.details.currentProgress?.stats?.total?.emails ?
                                                    <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: '400' }}> /{viewingTask.details.currentProgress.stats.total.emails}</span> : ''}
                                            </div>
                                        </div>
                                        <div style={{ background: 'rgba(34,139,34,0.05)', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(34,139,34,0.1)' }}>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>ARCHIVOS PROCESADOS</div>
                                            <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--success)' }}>
                                                {viewingTask.details.currentProgress?.stats?.files || 0}
                                                {viewingTask.details.currentProgress?.stats?.total?.files ?
                                                    <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: '400' }}> /{viewingTask.details.currentProgress.stats.total.files}</span> : ''}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                                    <h3 style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Terminal size={18} /> Registro de Actividad
                                    </h3>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Últimos 100 eventos</div>
                                </div>

                                <div style={{
                                    background: '#1e1e1e',
                                    color: '#4af626',
                                    padding: '1rem',
                                    borderRadius: '8px',
                                    fontSize: '0.8rem',
                                    fontFamily: 'monospace',
                                    maxHeight: '250px',
                                    overflowY: 'auto',
                                    boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.5)'
                                }}>
                                    {viewingTask.logs.length === 0 ? (
                                        <div style={{ opacity: 0.5 }}>Esperando logs...</div>
                                    ) : (
                                        viewingTask.logs.map((log: string, i: number) => (
                                            <div key={i} style={{ marginBottom: '4px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '2px' }}>
                                                <span style={{ opacity: 0.5, marginRight: '8px' }}>{log.split('] ')[0]}]</span>
                                                <span>{log.split('] ')[1] || log}</span>
                                            </div>
                                        ))
                                    )}
                                </div>

                                {viewingTask.status === 'running' && (
                                    <div style={{ marginTop: '1.5rem' }}>
                                        <button
                                            className="btn-outline"
                                            style={{ width: '100%', padding: '0.8rem', color: 'var(--error)', borderColor: 'var(--error)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                                            onClick={async () => {
                                                if (!confirm('¿Seguro que desea cancelar esta importación?')) return;
                                                await fetch(`/api/tasks/${viewingTask.id}/cancel`, { method: 'POST' });
                                                setViewingTask(null);
                                                fetchTasks();
                                            }}
                                        >
                                            <X size={20} /> Detener Tarea
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

                {/* Settings Modal */}
                {
                    (mounted && isSettingsModalOpen) && createPortal(
                        <div className="modal-overlay" onClick={() => { setIsSettingsModalOpen(false); setConfiguringItem(null); }}>
                            <div className="modal-content animate-fadeIn" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px', height: 'auto', maxHeight: '90vh' }}>
                                <div className="modal-header" style={{ marginBottom: '1.5rem' }}>
                                    <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                        <Settings color="var(--primary)" />
                                        Ajustes de Importación
                                    </h2>
                                    <button className="btn-primary" style={{ padding: '0.4rem 1rem' }} onClick={() => { setIsSettingsModalOpen(false); setConfiguringItem(null); }}>Cerrar</button>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.6rem' }}>
                                            {configuringItem ? `Destino para ${configuringItem.name}` : 'Destino de Restauración'}
                                        </label>
                                        {selectedItems.length > 1 && !configuringItem ? (
                                            <div style={{ padding: '1rem', background: 'rgba(0,120,212,0.05)', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--primary)', border: '1px solid var(--primary)' }}>
                                                <b>Modo Masivo:</b> Los elementos se mapearán automáticamente al destino que coincida con su nombre o UPN original.
                                            </div>
                                        ) : (
                                            <select className="input" style={{ width: '100%', height: '42px' }} value={targetId} onChange={e => setTargetId(e.target.value)}>
                                                <option value="">Selecciona destino...</option>
                                                {((configuringItem?.type || selectedItems[0]?.type) === 'user' ? destUsers : destSites).map(item => (
                                                    <option key={item.id} value={item.userPrincipalName || item.id}>
                                                        {item.displayName} ({item.userPrincipalName || item.id})
                                                    </option>
                                                ))}
                                            </select>
                                        )}
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem', background: '#f9f9f9', borderRadius: '10px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', cursor: 'pointer' }}>
                                            <input type="checkbox" checked={importSettings.emails} onChange={() => setImportSettings({ ...importSettings, emails: !importSettings.emails })} />
                                            <Mail size={16} /> <span style={{ flex: 1, fontSize: '0.9rem' }}>Correos y Carpetas</span>
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', cursor: 'pointer' }}>
                                            <input type="checkbox" checked={importSettings.onedrive} onChange={() => setImportSettings({ ...importSettings, onedrive: !importSettings.onedrive })} />
                                            <HardDrive size={16} /> <span style={{ flex: 1, fontSize: '0.9rem' }}>OneDrive / Documentos</span>
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', cursor: 'pointer' }}>
                                            <input type="checkbox" checked={importSettings.contacts} onChange={() => setImportSettings({ ...importSettings, contacts: !importSettings.contacts })} />
                                            <Contact2 size={16} /> <span style={{ flex: 1, fontSize: '0.9rem' }}>Contactos Personales</span>
                                        </label>
                                    </div>

                                    {(configuringItem || selectedItems.length > 0) && (
                                        <button className="btn-primary" style={{ marginTop: '0.5rem', padding: '1rem' }} onClick={() => handleStartImport()} disabled={isImporting || !targetId && (!selectedItems.length || selectedItems.length === 1)}>
                                            {isImporting ? 'Iniciando...' : configuringItem ? `Iniciar restauración de ${configuringItem.name}` : `Restaurar ${selectedItems.length} elementos`}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>,
                        document.body
                    )
                }

                {/* Comparison Report Modal */}
                {
                    (mounted && comparisonReport) && createPortal(
                        <div className="modal-overlay" onClick={() => setComparisonReport(null)}>
                            <div className="modal-content animate-fadeIn" onClick={e => e.stopPropagation()} style={{ maxWidth: '750px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                                <div className="modal-header">
                                    <div>
                                        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                                            <ShieldCheck color="var(--primary)" />
                                            Reporte de Integridad
                                        </h2>
                                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                            {comparisonReport.targetId ? `Destino/Origen: ${comparisonReport.targetId}` : `Backup: ${comparisonReport.sourceName}`}
                                        </p>
                                    </div>
                                    <button className="btn-primary" onClick={() => setComparisonReport(null)}>Cerrar</button>
                                </div>

                                <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
                                    <div style={{ display: 'grid', gap: '1rem' }}>
                                        {comparisonReport.sections.length === 0 ? (
                                            <div className="glass-card" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                                <AlertTriangle size={32} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                                                <p>No se encontraron datos para analizar en este backup.</p>
                                                <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>Es posible que la exportación esté dañada o no contenga los elementos esperados.</p>
                                            </div>
                                        ) : (
                                            comparisonReport.sections.map((section: any, idx: number) => (
                                                <div key={idx} className="glass-card" style={{ padding: '1rem', borderLeft: `6px solid ${section.status === 'ok' ? 'var(--success)' : 'var(--error)'}` }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <div>
                                                            <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                                                                {section.status === 'ok' ? <ShieldCheck size={18} color="var(--success)" /> : <AlertTriangle size={18} color="var(--error)" />}
                                                                {section.title}
                                                            </h4>
                                                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
                                                                Origen: <b>{section.tenantSourceCount !== undefined ? section.tenantSourceCount : '-'}</b> | Backup: <b>{section.exportedCount}</b> | Destino: <b>{section.importedCount}</b>
                                                            </div>
                                                        </div>
                                                        <div className={`badge ${section.status === 'ok' ? 'badge-success' : 'badge-error'}`} style={{ fontSize: '0.7rem' }}>
                                                            {section.status === 'ok' ? 'Correcto' : 'Discrepancia'}
                                                        </div>
                                                    </div>

                                                    {section.items && section.items.length > 0 && (
                                                        <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '0.8rem' }}>
                                                            <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'separate', borderSpacing: '0 4px' }}>
                                                                <thead>
                                                                    <tr style={{ color: 'var(--text-secondary)', textAlign: 'left' }}>
                                                                        <th style={{ padding: '4px' }}>Carpeta/Librería</th>
                                                                        <th style={{ padding: '4px', textAlign: 'center' }}>Original</th>
                                                                        <th style={{ padding: '4px', textAlign: 'center' }}>Backup</th>
                                                                        <th style={{ padding: '4px', textAlign: 'center' }}>Destino</th>
                                                                        <th style={{ padding: '4px', textAlign: 'right' }}>Estatus</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {section.items.map((item: any, iIdx: number) => (
                                                                        <tr key={iIdx} style={{ background: item.status === 'mismatch' ? 'rgba(164, 38, 44, 0.05)' : 'transparent' }}>
                                                                            <td style={{ padding: '6px 4px', fontWeight: '500' }}>{item.name}</td>
                                                                            <td style={{ padding: '6px 4px', textAlign: 'center' }}>{item.source}</td>
                                                                            <td style={{ padding: '6px 4px', textAlign: 'center' }}>{item.exported}</td>
                                                                            <td style={{ padding: '6px 4px', textAlign: 'center' }}>{item.target}</td>
                                                                            <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                                                                                <span style={{ color: item.status === 'ok' ? 'var(--success)' : 'var(--error)', fontWeight: 'bold' }}>
                                                                                    {item.status === 'ok' ? '✓' : '✗'}
                                                                                </span>
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>,
                        document.body
                    )
                }
                {/* Removed viewingTask modal portal */}

                {/* History Modal */}
                {
                    (mounted && historyItem) && createPortal(
                        <div className="modal-overlay" onClick={() => setHistoryItem(null)}>
                            <div className="modal-content animate-fadeIn" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
                                <div className="modal-header">
                                    <div>
                                        <h2 style={{ marginBottom: '0.2rem' }}>Historial de Tareas</h2>
                                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{historyItem.name}</p>
                                    </div>
                                    <button className="btn-primary" onClick={() => setHistoryItem(null)}>Cerrar</button>
                                </div>

                                <div style={{ maxHeight: '400px', overflowY: 'auto', padding: '0.5rem' }}>
                                    {tasks.filter(t =>
                                        t.type === 'import' && (
                                            (historyItem.type === 'item' && (t.details.item?.path === historyItem.id || t.details.currentProgress?.itemId === historyItem.id))
                                        )
                                    ).length === 0 ? (
                                        <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>No hay importaciones registradas para este elemento.</p>
                                    ) : (
                                        tasks.filter(t =>
                                            t.type === 'import' && (
                                                (historyItem.type === 'item' && (t.details.item?.path === historyItem.id || t.details.currentProgress?.itemId === historyItem.id))
                                            )
                                        ).map((t, idx) => (
                                            <div
                                                key={t.id}
                                                className="glass-card"
                                                style={{
                                                    padding: '1rem',
                                                    marginBottom: '0.8rem',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    borderLeft: `4px solid ${t.status === 'completed' ? 'var(--success)' : t.status === 'failed' ? 'var(--error)' : 'var(--warning)'}`
                                                }}
                                                onClick={() => {
                                                    setViewingTask(t);
                                                    setHistoryItem(null);
                                                }}
                                            >
                                                <div>
                                                    <div style={{ fontWeight: '600' }}>
                                                        {t.type === 'export' ? 'Exportación' : 'Importación'} - {new Date(t.startTime).toLocaleDateString()}
                                                    </div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                        Inicio: {new Date(t.startTime).toLocaleTimeString()}
                                                        {t.endTime && ` - Fin: ${new Date(t.endTime).toLocaleTimeString()}`}
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Elementos</div>
                                                        <div style={{ fontWeight: 'bold' }}>
                                                            {(t.details.currentProgress?.stats?.emails || 0) + (t.details.currentProgress?.stats?.files || 0)}
                                                        </div>
                                                    </div>
                                                    <ChevronRight size={20} color="var(--text-secondary)" />
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>,
                        document.body
                    )
                }
            </div > {/* Container end */}
        </>
    );
}
