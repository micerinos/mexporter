"use client";

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import path from 'path';
import {
  Users,
  Globe,
  Download,
  Settings,
  CheckCircle2,
  Search,
  ChevronRight,
  Play,
  Clock,
  Terminal,
  X,
  HardDrive,
  Mail,
  Contact2,
  ListRestart,
  BarChart3,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';

interface User {
  id: string;
  displayName: string;
  userPrincipalName: string;
  mail?: string;
  isExported?: boolean;
}

interface Site {
  id: string;
  displayName: string;
  webUrl: string;
  name: string;
  isExported?: boolean;
}

export default function ExportDashboard() {
  const [activeTab, setActiveTab] = useState<'all' | 'users' | 'sites'>('all');
  const [users, setUsers] = useState<User[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedSites, setSelectedSites] = useState<string[]>([]);
  const [exportSettings, setExportSettings] = useState({
    emails: true,
    contacts: true,
    rules: true,
    onedrive: true,
    incremental: true
  });
  const [isExporting, setIsExporting] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [sourceTenantName, setSourceTenantName] = useState('');
  const [comparisonReport, setComparisonReport] = useState<any>(null);
  const [sources, setSources] = useState<any[]>([]);
  const [activeSourceId, setActiveSourceId] = useState<string>('');
  const [mounted, setMounted] = useState(false);
  const [tasks, setTasks] = useState<any[]>([]);
  const [viewingTask, setViewingTask] = useState<any | null>(null);
  const [historyItem, setHistoryItem] = useState<any | null>(null);
  const [showLogs, setShowLogs] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchTasks = async () => {
    try {
      const res = await fetch('/api/tasks');
      const data = await res.json();

      // Prevent unnecessary re-renders of the whole dashboard
      // Use a simple check or deep comparison if needed
      if (JSON.stringify(data) !== JSON.stringify(tasks)) {
        setTasks(data);
      }

      if (viewingTask && viewingTask.status === 'running') {
        const current = data.find((t: any) => t.id === viewingTask.id);
        if (current) {
          // Avoid setting state if nothing meaningful changed to prevent flickering
          const hasChanged =
            current.status !== viewingTask.status ||
            current.logs.length !== viewingTask.logs.length ||
            JSON.stringify(current.details) !== JSON.stringify(viewingTask.details) ||
            current.progress !== viewingTask.progress;

          if (hasChanged) {
            setViewingTask(current);
          }
        }
      }
    } catch (e) { }
  };

  useEffect(() => {
    // Poll more frequently if a task is running to show real-time progress
    const interval = setInterval(fetchTasks, viewingTask && viewingTask.status === 'running' ? 2000 : 5000);
    return () => clearInterval(interval);
  }, [`${viewingTask?.id}-${viewingTask?.status}`]);

  const fetchData = async () => {
    const configStr = localStorage.getItem('m365_migration_config');
    if (!configStr) {
      setLoading(false);
      return;
    }

    const config = JSON.parse(configStr);
    const availableSources = config.sources || (config.source ? [config.source] : []);
    setSources(availableSources);

    const currentSourceId = activeSourceId || config.activeSourceId || availableSources[0]?.id;
    if (currentSourceId && !activeSourceId) setActiveSourceId(currentSourceId);

    const activeSource = availableSources.find((s: any) => s.id === currentSourceId) || availableSources[0];
    if (!activeSource) {
      setLoading(false);
      return;
    }

    const { storage } = config;
    setSourceTenantName(activeSource.name || 'Tenant Origen');
    setLoading(true);
    try {
      const [usersRes, sitesRes, tenantRes] = await Promise.all([
        fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: activeSource, storageConfig: storage })
        }),
        fetch('/api/sites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: activeSource, storageConfig: storage })
        }),
        fetch('/api/tenant-info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: activeSource })
        })
      ]);
      const usersData = await usersRes.json();
      const sitesData = await sitesRes.json();
      const tenantData = await tenantRes.json();

      setUsers(Array.isArray(usersData) ? usersData : []);
      setSites(Array.isArray(sitesData) ? sitesData : []);
      if (tenantData.displayName) setSourceTenantName(tenantData.displayName);
    } catch (e) {
      console.error('Error fetching data:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSourceChange = (newSourceId: string) => {
    setActiveSourceId(newSourceId);
    // Update active source in localStorage so it persists
    const configStr = localStorage.getItem('m365_migration_config');
    if (configStr) {
      const config = JSON.parse(configStr);
      config.activeSourceId = newSourceId;
      // Also update the 'source' for backward compatibility in backend calls if needed
      config.source = config.sources?.find((s: any) => s.id === newSourceId);
      localStorage.setItem('m365_migration_config', JSON.stringify(config));
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeSourceId]);

  const toggleSelectAll = () => {
    if (activeTab === 'all') {
      const allUserIds = filteredUsers.map(u => u.id);
      const allSiteIds = filteredSites.map(s => s.id);
      const allUsersSelected = allUserIds.length > 0 && allUserIds.every(id => selectedUsers.includes(id));
      const allSitesSelected = allSiteIds.length > 0 && allSiteIds.every(id => selectedSites.includes(id));

      if (allUsersSelected && allSitesSelected) {
        setSelectedUsers(prev => prev.filter(id => !allUserIds.includes(id)));
        setSelectedSites(prev => prev.filter(id => !allSiteIds.includes(id)));
      } else {
        setSelectedUsers(prev => [...new Set([...prev, ...allUserIds])]);
        setSelectedSites(prev => [...new Set([...prev, ...allSiteIds])]);
      }
    } else if (activeTab === 'users') {
      const allFilteredIds = filteredUsers.map(u => u.id);
      const allSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedUsers.includes(id));
      if (allSelected) {
        setSelectedUsers(prev => prev.filter(id => !allFilteredIds.includes(id)));
      } else {
        setSelectedUsers(prev => [...new Set([...prev, ...allFilteredIds])]);
      }
    } else {
      const allFilteredIds = filteredSites.map(s => s.id);
      const allSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedSites.includes(id));
      if (allSelected) {
        setSelectedSites(prev => prev.filter(id => !allFilteredIds.includes(id)));
      } else {
        setSelectedSites(prev => [...new Set([...prev, ...allFilteredIds])]);
      }
    }
  };

  const handleStartExport = async (itemToExport?: { id: string, type: 'user' | 'site' }) => {
    const uToExport = itemToExport?.type === 'user' ? [itemToExport.id] : selectedUsers;
    const sToExport = itemToExport?.type === 'site' ? [itemToExport.id] : selectedSites;

    if (uToExport.length === 0 && sToExport.length === 0) return;

    const configStr = localStorage.getItem('m365_migration_config');
    if (!configStr) {
      alert("Configura el Tenant de Origen y el Almacenamiento primero.");
      return;
    }
    const { storage } = JSON.parse(configStr);

    // Get active source
    const config = JSON.parse(configStr);
    const availableSources = config.sources || (config.source ? [config.source] : []);
    const currentSourceId = activeSourceId || config.activeSourceId;
    const activeSource = availableSources.find((s: any) => s.id === currentSourceId) || availableSources[0];

    setIsExporting(true);
    try {
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedUsers: uToExport,
          selectedSites: sToExport,
          settings: exportSettings,
          config: activeSource,
          storageConfig: storage
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error al iniciar la tarea');
      }

      await response.json();
      setSelectedUsers([]);
      setSelectedSites([]);
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleCompare = async (item: any, type: 'user' | 'site') => {
    const configStr = localStorage.getItem('m365_migration_config');
    if (!configStr) return;
    const config = JSON.parse(configStr);
    const { storage, destination } = config;

    // Get active source
    const availableSources = config.sources || (config.source ? [config.source] : []);
    const currentSourceId = activeSourceId || config.activeSourceId;
    const activeSource = availableSources.find((s: any) => s.id === currentSourceId) || availableSources[0];

    const tenantPrefix = activeSource.name ? activeSource.name.replace(/[<>:"/\\|?*]/g, '_').trim() : '';
    let itemPath = '';
    if (type === 'user') {
      itemPath = path.join(tenantPrefix, 'users', item.userPrincipalName);
    } else {
      const siteName = item.name || (item.webUrl ? item.webUrl.split('/').pop() : item.id);
      itemPath = path.join(tenantPrefix, 'sites', siteName);
    }

    setIsComparing(true);
    try {
      console.log('Iniciando comparación para:', item.userPrincipalName || item.name);
      const response = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item: { ...item, type, path: itemPath, upn: type === 'user' ? item.userPrincipalName : item.id },
          targetId: type === 'user' ? (item.targetPrincipalName || item.userPrincipalName) : item.id,
          storageConfig: storage,
          sourceConfig: activeSource,
          destinationConfig: destination
        })
      });

      let data;
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const text = await response.text();
        console.error('Respuesta no-JSON:', text);
        throw new Error(`Error del servidor: ${text.substring(0, 100)}...`);
      }

      console.log('Datos de comparación recibidos:', data);
      if (data.error) throw new Error(data.error);
      setComparisonReport(data);
    } catch (error: any) {
      console.error('Error en handleCompare:', error);
      alert(`Error en la comparación: ${error.message}`);
    } finally {
      setIsComparing(false);
    }
  };

  const filteredUsers = users.filter(u =>
    (u.displayName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (u.userPrincipalName?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  const filteredSites = sites.filter(s =>
    (s.displayName?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  return (
    <>
      <div className="container animate-fadeIn" style={{ maxWidth: '1400px' }}>
        {/* Header */}
        <header style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '1.8rem', marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
              Migración Microsoft 365
              {sources.length > 1 ? (
                <select
                  className="badge"
                  style={{
                    fontSize: '0.8rem',
                    background: 'var(--primary)',
                    color: 'white',
                    border: 'none',
                    padding: '0.2rem 0.5rem',
                    cursor: 'pointer',
                    borderRadius: '12px',
                    appearance: 'none',
                    textAlign: 'center'
                  }}
                  value={activeSourceId}
                  onChange={(e) => handleSourceChange(e.target.value)}
                >
                  {sources.map(s => (
                    <option key={s.id} value={s.id} style={{ color: 'black' }}>{s.name || s.tenantId}</option>
                  ))}
                </select>
              ) : (
                sourceTenantName && <span className="badge" style={{ fontSize: '0.8rem', background: 'var(--primary)', color: 'white' }}>{sourceTenantName}</span>
              )}
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Exportación de datos de origen a backup seguro</p>
          </div>
          <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
            <button
              className="btn-outline"
              style={{ padding: '0.6rem', borderRadius: 'var(--radius)' }}
              onClick={() => setIsSettingsModalOpen(true)}
              title="Ajustes"
            >
              <Settings size={20} />
            </button>

            <button
              className="btn-primary"
              onClick={() => handleStartExport()}
              disabled={isExporting || (selectedUsers.length === 0 && selectedSites.length === 0)}
              style={{ padding: '0.6rem 1.2rem', gap: '0.5rem', display: 'flex', alignItems: 'center' }}
            >
              <Download size={18} />
              {isExporting ? '...' : (selectedUsers.length + selectedSites.length) > 0 ? `Exportar (${selectedUsers.length + selectedSites.length})` : 'Exportar Seleccionados'}
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
              <p style={{ fontSize: '0.8rem', opacity: 0.8 }}>Comparando datos locales con Microsoft Graph</p>
            </div>
          </div>,
          document.body
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '1.5rem', alignItems: 'start' }}>
          {/* Main Content Area */}
          <div className="glass-card" style={{ padding: '0' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="tab-group" style={{ padding: '0.2rem', background: '#f0f0f0', borderRadius: '10px' }}>
                <button
                  className={`tab ${activeTab === 'all' ? 'active' : ''}`}
                  style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                  onClick={() => setActiveTab('all')}
                >
                  Todos
                </button>
                <button
                  className={`tab ${activeTab === 'users' ? 'active' : ''}`}
                  style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                  onClick={() => setActiveTab('users')}
                >
                  <Users size={16} /> Usuarios
                </button>
                <button
                  className={`tab ${activeTab === 'sites' ? 'active' : ''}`}
                  style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                  onClick={() => setActiveTab('sites')}
                >
                  <Globe size={16} /> Sitios
                </button>
              </div>

              <div style={{ position: 'relative', width: '220px' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input
                  className="input"
                  placeholder="Buscar..."
                  style={{ paddingLeft: '2.2rem', paddingRight: '0.5rem', height: '36px', fontSize: '0.85rem' }}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div style={{ maxHeight: 'calc(100vh - 250px)', overflowY: 'auto' }}>
              {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
                  <div className="animate-pulse" style={{ color: 'var(--primary)', fontWeight: '600' }}>Cargando...</div>
                </div>
              ) : (
                <table style={{ fontSize: '0.85rem' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: 'white' }}>
                    <tr>
                      <th style={{ width: '40px' }}>
                        <input
                          type="checkbox"
                          checked={
                            activeTab === 'all'
                              ? ((filteredUsers.length + filteredSites.length) > 0 &&
                                filteredUsers.every(u => selectedUsers.includes(u.id)) &&
                                filteredSites.every(s => selectedSites.includes(s.id)))
                              : activeTab === 'users'
                                ? (filteredUsers.length > 0 && filteredUsers.every(u => selectedUsers.includes(u.id)))
                                : (filteredSites.length > 0 && filteredSites.every(s => selectedSites.includes(s.id)))
                          }
                          onChange={toggleSelectAll}
                        />
                      </th>
                      <th>Nombre</th>
                      {activeTab === 'all' && <th>Tipo</th>}
                      <th>Identificador</th>
                      <th style={{ textAlign: 'center' }}>Estado</th>
                      <th style={{ width: '110px', textAlign: 'right' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeTab === 'all' ? (
                      <>
                        {filteredUsers.map(user => (
                          <tr
                            key={`user-${user.id}`}
                            className={selectedUsers.includes(user.id) ? 'selected' : ''}
                            onClick={() => setSelectedUsers(prev => prev.includes(user.id) ? prev.filter(id => id !== user.id) : [...prev, user.id])}
                            style={{ cursor: 'pointer' }}
                          >
                            <td onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selectedUsers.includes(user.id)}
                                onChange={() => setSelectedUsers(prev => prev.includes(user.id) ? prev.filter(id => id !== user.id) : [...prev, user.id])}
                              />
                            </td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <div className="avatar" style={{ width: '28px', height: '28px', fontSize: '0.7rem' }}>
                                  {user.displayName?.[0] || 'U'}
                                </div>
                                <div style={{ fontWeight: '500' }}>{user.displayName}</div>
                              </div>
                            </td>
                            <td>
                              <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>Usuario</span>
                            </td>
                            <td style={{ color: 'var(--text-secondary)' }}>{user.userPrincipalName}</td>
                            <td style={{ textAlign: 'center' }}>
                              {(() => {
                                const userTasks = tasks.filter(t =>
                                  t.details.selectedUsers?.includes(user.id) ||
                                  t.details.currentProgress?.itemId === user.id
                                );
                                const activeTask = userTasks.find(t => t.status === 'running');
                                if (activeTask) return <div className="animate-pulse"><Clock size={16} color="var(--warning)" /></div>;
                                const latestTask = userTasks[0];
                                if (!latestTask) return user.isExported ? <CheckCircle2 size={16} color="var(--success)" /> : <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '2px solid #ddd', margin: '0 auto' }} />;
                                const getIcon = () => {
                                  switch (latestTask.status) {
                                    case 'completed': return <CheckCircle2 size={16} color="var(--success)" />;
                                    case 'failed': return <AlertTriangle size={16} color="var(--error)" />;
                                    case 'cancelled': return <X size={16} color="var(--text-secondary)" />;
                                    default: return <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '2px solid #ddd', margin: '0 auto' }} />;
                                  }
                                };
                                return <div title={latestTask.status.toUpperCase()}>{getIcon()}</div>;
                              })()}
                            </td>
                            <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'right' }}>
                              <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                                <button className="btn-outline" style={{ padding: '4px', color: 'var(--primary)', border: 'none' }} onClick={() => handleStartExport({ id: user.id, type: 'user' })} title="Exportar Ahora"><Play size={16} /></button>
                                <button className="btn-outline" style={{ padding: '4px', color: user.isExported ? 'var(--success)' : 'var(--text-secondary)', border: 'none' }} onClick={() => handleCompare(user, 'user')} title="Análisis de Integridad"><ShieldCheck size={16} /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {filteredSites.map(site => (
                          <tr
                            key={`site-${site.id}`}
                            className={selectedSites.includes(site.id) ? 'selected' : ''}
                            onClick={() => setSelectedSites(prev => prev.includes(site.id) ? prev.filter(id => id !== site.id) : [...prev, site.id])}
                            style={{ cursor: 'pointer' }}
                          >
                            <td onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selectedSites.includes(site.id)}
                                onChange={() => setSelectedSites(prev => prev.includes(site.id) ? prev.filter(id => id !== site.id) : [...prev, site.id])}
                              />
                            </td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <div className="avatar" style={{ width: '28px', height: '28px', background: '#0078d4' }}>
                                  <Globe size={14} color="white" />
                                </div>
                                <div style={{ fontWeight: '500' }}>{site.displayName}</div>
                              </div>
                            </td>
                            <td>
                              <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>Sitio</span>
                            </td>
                            <td style={{ color: 'var(--text-secondary)' }}>{site.name}</td>
                            <td style={{ textAlign: 'center' }}>
                              {(() => {
                                const siteTasks = tasks.filter(t =>
                                  t.details.selectedSites?.includes(site.id) ||
                                  t.details.currentProgress?.itemId === site.id
                                );
                                const activeTask = siteTasks.find(t => t.status === 'running');
                                if (activeTask) return <div className="animate-pulse"><Clock size={16} color="var(--warning)" /></div>;
                                const latestTask = siteTasks[0];
                                if (!latestTask) return site.isExported ? <CheckCircle2 size={16} color="var(--success)" /> : <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '2px solid #ddd', margin: '0 auto' }} />;
                                const getIcon = () => {
                                  switch (latestTask.status) {
                                    case 'completed': return <CheckCircle2 size={16} color="var(--success)" />;
                                    case 'failed': return <AlertTriangle size={16} color="var(--error)" />;
                                    case 'cancelled': return <X size={16} color="var(--text-secondary)" />;
                                    default: return <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '2px solid #ddd', margin: '0 auto' }} />;
                                  }
                                };
                                return <div title={latestTask.status.toUpperCase()}>{getIcon()}</div>;
                              })()}
                            </td>
                            <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'right' }}>
                              <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                                <button className="btn-outline" style={{ padding: '4px', color: 'var(--primary)', border: 'none' }} onClick={() => handleStartExport({ id: site.id, type: 'site' })} title="Exportar Ahora"><Play size={16} /></button>
                                <button className="btn-outline" style={{ padding: '4px', color: site.isExported ? 'var(--success)' : 'var(--text-secondary)', border: 'none' }} onClick={() => handleCompare(site, 'site')} title="Análisis de Integridad"><ShieldCheck size={16} /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </>
                    ) : activeTab === 'users' ? (
                      filteredUsers.map(user => (
                        <tr
                          key={user.id}
                          className={selectedUsers.includes(user.id) ? 'selected' : ''}
                          onClick={() => setSelectedUsers(prev => prev.includes(user.id) ? prev.filter(id => id !== user.id) : [...prev, user.id])}
                          style={{ cursor: 'pointer' }}
                        >
                          <td onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedUsers.includes(user.id)}
                              onChange={() => setSelectedUsers(prev => prev.includes(user.id) ? prev.filter(id => id !== user.id) : [...prev, user.id])}
                            />
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                              <div className="avatar" style={{ width: '28px', height: '28px', fontSize: '0.7rem' }}>
                                {user.displayName?.[0] || 'U'}
                              </div>
                              <div style={{ fontWeight: '500' }}>{user.displayName}</div>
                            </div>
                          </td>
                          <td style={{ color: 'var(--text-secondary)' }}>{user.userPrincipalName}</td>
                          <td style={{ textAlign: 'center' }}>
                            {(() => {
                              const userTasks = tasks.filter(t =>
                                t.details.selectedUsers?.includes(user.id) ||
                                t.details.currentProgress?.itemId === user.id
                              );

                              const activeTask = userTasks.find(t => t.status === 'running');
                              if (activeTask) {
                                return (
                                  <div
                                    style={{ display: 'inline-flex' }}
                                    className="animate-pulse"
                                  >
                                    <Clock size={16} color="var(--warning)" />
                                  </div>
                                );
                              }

                              const latestTask = userTasks[0]; // tasks are sorted by startTime descending
                              if (!latestTask) {
                                return user.isExported ? <CheckCircle2 size={16} color="var(--success)" /> :
                                  <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '2px solid #ddd', margin: '0 auto' }} title="Pendiente" />;
                              }

                              const getIcon = () => {
                                switch (latestTask.status) {
                                  case 'completed': return <CheckCircle2 size={16} color="var(--success)" />;
                                  case 'failed': return <AlertTriangle size={16} color="var(--error)" />;
                                  case 'cancelled': return <X size={16} color="var(--text-secondary)" />;
                                  default: return <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '2px solid #ddd', margin: '0 auto' }} />;
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
                              <button
                                className="btn-outline"
                                style={{ padding: '4px', color: 'var(--primary)', border: 'none' }}
                                onClick={() => handleStartExport({ id: user.id, type: 'user' })}
                                title="Exportar Ahora"
                              >
                                <Play size={16} />
                              </button>
                              <button
                                className="btn-outline"
                                style={{ padding: '4px', color: user.isExported ? 'var(--success)' : 'var(--text-secondary)', border: 'none' }}
                                onClick={() => handleCompare(user, 'user')}
                                title="Análisis de Integridad"
                              >
                                <ShieldCheck size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      filteredSites.map(site => (
                        <tr
                          key={site.id}
                          className={selectedSites.includes(site.id) ? 'selected' : ''}
                          onClick={() => setSelectedSites(prev => prev.includes(site.id) ? prev.filter(id => id !== site.id) : [...prev, site.id])}
                          style={{ cursor: 'pointer' }}
                        >
                          <td onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedSites.includes(site.id)}
                              onChange={() => setSelectedSites(prev => prev.includes(site.id) ? prev.filter(id => id !== site.id) : [...prev, site.id])}
                            />
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                              <div className="avatar" style={{ width: '28px', height: '28px', background: '#0078d4' }}>
                                <Globe size={14} color="white" />
                              </div>
                              <div style={{ fontWeight: '500' }}>{site.displayName}</div>
                            </div>
                          </td>
                          <td style={{ color: 'var(--text-secondary)' }}>{site.name}</td>
                          <td style={{ textAlign: 'center' }}>
                            {(() => {
                              const siteTasks = tasks.filter(t =>
                                t.details.selectedSites?.includes(site.id) ||
                                t.details.currentProgress?.itemId === site.id
                              );

                              const activeTask = siteTasks.find(t => t.status === 'running');
                              if (activeTask) {
                                return (
                                  <div
                                    style={{ display: 'inline-flex' }}
                                    className="animate-pulse"
                                  >
                                    <Clock size={16} color="var(--warning)" />
                                  </div>
                                );
                              }

                              const latestTask = siteTasks[0];
                              if (!latestTask) {
                                return site.isExported ? <CheckCircle2 size={16} color="var(--success)" /> :
                                  <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '2px solid #ddd', margin: '0 auto' }} title="Pendiente" />;
                              }

                              const getIcon = () => {
                                switch (latestTask.status) {
                                  case 'completed': return <CheckCircle2 size={16} color="var(--success)" />;
                                  case 'failed': return <AlertTriangle size={16} color="var(--error)" />;
                                  case 'cancelled': return <X size={16} color="var(--text-secondary)" />;
                                  default: return <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '2px solid #ddd', margin: '0 auto' }} />;
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
                              <button
                                className="btn-outline"
                                style={{ padding: '4px', color: 'var(--primary)', border: 'none' }}
                                onClick={() => handleStartExport({ id: site.id, type: 'site' })}
                                title="Exportar Ahora"
                              >
                                <Play size={16} />
                              </button>
                              <button
                                className="btn-outline"
                                style={{ padding: '4px', color: site.isExported ? 'var(--success)' : 'var(--text-secondary)', border: 'none' }}
                                onClick={() => handleCompare(site, 'site')}
                                title="Análisis de Integridad"
                              >
                                <ShieldCheck size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Task Sidebar */}
          <div className="glass-card" style={{ padding: '1rem', position: 'sticky', top: '1.5rem', maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}>
            <h3 style={{ marginBottom: '1rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <Clock size={18} color="var(--primary)" /> Dashboard de Tareas
            </h3>

            {tasks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                No hay tareas recientes
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                {tasks.filter((t: any) => t.type === 'export').map((task: any) => {
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
                          Exportación {task.id.slice(-4)}
                        </div>
                        <div className={`badge ${task.status === 'completed' ? 'badge-success' : task.status === 'failed' ? 'badge-error' : 'badge-warning'}`} style={{ fontSize: '0.65rem' }}>
                          {task.status === 'running' ? 'En curso' : task.status}
                        </div>
                      </div>

                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {new Date(task.startTime).toLocaleTimeString()} {task.details.selectedUsers?.length + task.details.selectedSites?.length} elementos
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div> {/* This closes the Grid */}

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
                        if (!confirm('¿Seguro que desea cancelar esta exportación?')) return;
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
            <div className="modal-overlay" onClick={() => setIsSettingsModalOpen(false)}>
              <div className="modal-content animate-fadeIn" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px', maxHeight: 'auto' }}>
                <div className="modal-header" style={{ marginBottom: '1.5rem' }}>
                  <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <Settings color="var(--primary)" />
                    Ajustes de Exportación
                  </h2>
                  <button className="btn-primary" style={{ padding: '0.4rem 1rem' }} onClick={() => setIsSettingsModalOpen(false)}>Listo</button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                  {activeTab === 'users' && (
                    <>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }}>
                        <input type="checkbox" style={{ width: '18px', height: '18px' }} checked={exportSettings.emails} onChange={() => setExportSettings({ ...exportSettings, emails: !exportSettings.emails })} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '600', fontSize: '0.95rem' }}>Correos Electrónicos</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Buzón completo y carpetas</div>
                        </div>
                        <Mail size={18} color="var(--text-secondary)" />
                      </label>

                      <label style={{ display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }}>
                        <input type="checkbox" style={{ width: '18px', height: '18px' }} checked={exportSettings.contacts} onChange={() => setExportSettings({ ...exportSettings, contacts: !exportSettings.contacts })} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '600', fontSize: '0.95rem' }}>Contactos</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Agenda personal</div>
                        </div>
                        <Contact2 size={18} color="var(--text-secondary)" />
                      </label>

                      <label style={{ display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }}>
                        <input type="checkbox" style={{ width: '18px', height: '18px' }} checked={exportSettings.rules} onChange={() => setExportSettings({ ...exportSettings, rules: !exportSettings.rules })} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '600', fontSize: '0.95rem' }}>Reglas de Buzón</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Filtros y redirecciones</div>
                        </div>
                        <Settings size={18} color="var(--text-secondary)" />
                      </label>
                    </>
                  )}

                  <label style={{ display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }}>
                    <input type="checkbox" style={{ width: '18px', height: '18px' }} checked={exportSettings.onedrive} onChange={() => setExportSettings({ ...exportSettings, onedrive: !exportSettings.onedrive })} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '600', fontSize: '0.95rem' }}>{activeTab === 'users' ? 'Archivos OneDrive' : 'Contenido SharePoint'}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Documentos y archivos adjuntos</div>
                    </div>
                    <HardDrive size={18} color="var(--text-secondary)" />
                  </label>

                  <div style={{ height: '1px', background: 'var(--border)', margin: '0.5rem 0' }} />

                  <label style={{ display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }}>
                    <input type="checkbox" style={{ width: '18px', height: '18px' }} checked={exportSettings.incremental} onChange={() => setExportSettings({ ...exportSettings, incremental: !exportSettings.incremental })} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '600', fontSize: '0.95rem', color: 'var(--primary)' }}>Copia Incremental</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Solo ficheros nuevos o modificados</div>
                    </div>
                    <ListRestart size={18} color="var(--primary)" />
                  </label>
                </div>
              </div>
            </div>,
            document.body
          )
        }

        {/* Integrity Report Modal */}
        {
          (mounted && comparisonReport) && createPortal(
            <div className="modal-overlay" style={{ zIndex: 200000 }} onClick={() => setComparisonReport(null)}>
              <div className="modal-content animate-fadeIn" onClick={e => e.stopPropagation()} style={{ maxWidth: '750px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div className="modal-header">
                  <div>
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                      <BarChart3 color="var(--primary)" />
                      Reporte de Integridad
                    </h2>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Backup: {comparisonReport.sourceName}</p>
                  </div>
                  <button className="btn-primary" onClick={() => setComparisonReport(null)}>Cerrar</button>
                </div>

                <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
                  <div style={{ display: 'grid', gap: '1rem' }}>
                    {comparisonReport.sections.length === 0 ? (
                      <div className="glass-card" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        <AlertTriangle size={32} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                        <p>No se encontraron datos para analizar en este backup.</p>
                        <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>Es posible que la exportación nunca se haya realizado o esté incompleta.</p>
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
                                Original: <b>{section.tenantSourceCount !== undefined ? section.tenantSourceCount : '-'}</b> | Backup: <b>{section.exportedCount}</b>
                              </div>
                            </div>
                            <div className={`badge ${section.status === 'ok' ? 'badge-success' : 'badge-error'}`} style={{ fontSize: '0.7rem' }}>
                              {section.status === 'ok' ? 'Íntegro' : 'Discrepancia'}
                            </div>
                          </div>

                          {section.items && section.items.length > 0 && (
                            <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '0.8rem' }}>
                              <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'separate', borderSpacing: '0 4px' }}>
                                <thead>
                                  <tr style={{ color: 'var(--text-secondary)', textAlign: 'left' }}>
                                    <th style={{ padding: '4px' }}>Elemento</th>
                                    <th style={{ padding: '4px', textAlign: 'center' }}>Original</th>
                                    <th style={{ padding: '4px', textAlign: 'center' }}>Backup</th>
                                    <th style={{ padding: '4px', textAlign: 'right' }}>Estado</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {section.items.map((item: any, iIdx: number) => (
                                    <tr key={iIdx} style={{ background: item.status === 'mismatch' ? 'rgba(164, 38, 44, 0.05)' : 'transparent' }}>
                                      <td style={{ padding: '6px 4px', fontWeight: '500' }}>{item.name}</td>
                                      <td style={{ padding: '6px 4px', textAlign: 'center' }}>{item.source !== undefined ? item.source : '-'}</td>
                                      <td style={{ padding: '6px 4px', textAlign: 'center' }}>{item.exported}</td>
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

                          {section.details && section.details.map((detail: string, dIdx: number) => (
                            <div key={dIdx} style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.4rem', paddingLeft: '1.5rem' }}>
                              • {detail}
                            </div>
                          ))}
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
                    t.type === 'export' && (
                      (historyItem.type === 'user' && (t.details.selectedUsers?.includes(historyItem.id) || t.details.currentProgress?.itemId === historyItem.id)) ||
                      (historyItem.type === 'site' && (t.details.selectedSites?.includes(historyItem.id) || t.details.currentProgress?.itemId === historyItem.id))
                    )
                  ).length === 0 ? (
                    <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>No hay exportaciones registradas para este elemento.</p>
                  ) : (
                    tasks.filter(t =>
                      t.type === 'export' && (
                        (historyItem.type === 'user' && (t.details.selectedUsers?.includes(historyItem.id) || t.details.currentProgress?.itemId === historyItem.id)) ||
                        (historyItem.type === 'site' && (t.details.selectedSites?.includes(historyItem.id) || t.details.currentProgress?.itemId === historyItem.id))
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
      </div> {/* This closes the Container */}
    </>
  );
}
