# M365 Exporter 📤

[English](#english) | [Español](#español)

---

<a name="english"></a>
## English Version

M365 Exporter is a powerful, web-based tool designed to facilitate the selective export and migration of Microsoft 365 data. It allows administrators to backup user mailboxes, OneDrive files, and SharePoint sites directly to local storage or Amazon S3.

### 🚀 Key Features

- **Selective Export**: Choose specific users or SharePoint sites to export.
- **Data Integrity Analysis**: Real-time comparison between source (M365), local backup, and destination tenant.
- **Modern Interface**: Intuitive UI built with Next.js and Lucide icons (Currently in Spanish).
- **Cloud Storage Support**: Export your data to local drives or directly to an S3 bucket.
- **Incremental Exports**: Only download new or modified files to save bandwidth and time.

### 🛠 Prerequisites

Before using M365 Exporter, you need:
1. **Azure App Registration**: Create a registration in your Microsoft Entra ID (Azure AD).
2. **API Permissions (Application Type)**:
   - **Origin Tenant (Export)**:
     - `User.Read.All`, `Mail.Read`, `Files.Read.All`, `Sites.Read.All`
     - `Contacts.Read` (optional for contacts), `MailboxSettings.Read` (optional for rules)
   - **Destination Tenant (Import & Comparison)**:
     - `User.Read.All`, `Mail.ReadWrite`, `Files.ReadWrite.All`, `Sites.ReadWrite.All`
     - `Contacts.ReadWrite` (optional), `MailboxSettings.ReadWrite` (optional)
3. **Client Secret**: Generate a secret for your App Registration.

### ⚙️ Setup & Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/micerinos/mexporter.git
   cd MExporter
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run the development server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) with your browser.

### 📖 Usage Guide

#### 1. Configuration
Click on the **Settings (Gear icon)** to configure your tenants:
- **Source Tenant**: Credentials for the tenant you want to export data from.
- **Destination Tenant**: Credentials for the tenant where you might want to import data or perform integrity checks.
- **Storage**: Choose between **Local** (specify a path) or **S3** (provide bucket and credentials).

#### 2. Performing Exports
On the main dashboard:
- **Select Items**: Use the tabs to browse through "Users" or "Sites". You can select multiple items using checkboxes.
- **Export Settings**:
    - **Emails, Contacts, Rules, OneDrive**: Toggle what data types to include.
    - **Incremental**: If enabled, it only downloads files that have changed or are missing in the backup.
- **Start Export**: Click "Export Selected". You can monitor progress in the right sidebar "Task Dashboard".
- **Integrity Check**: Click the shield icon next to an item to compare the local backup against the live tenant data.

#### 3. Performing Imports
Go to the **Import** section from the navigation bar:
- **Select Backup**: Browse your storage to select the folder of the user or site you want to restore.
- **Target Identification**: Specify the email or ID of the user/site in the destination tenant.
- **Select Data**: Choose what to import (Mail, OneDrive, etc.).
- **Monitor**: Progress is shown in real-time with detailed logs for প্রত্যেক item being transferred.

---

<a name="español"></a>
## Versión en Español

M365 Exporter es una herramienta web avanzada diseñada para facilitar la exportación selectiva y migración de datos de Microsoft 365. Permite a los administradores realizar copias de seguridad de buzones de correo, archivos de OneDrive y sitios de SharePoint directamente en almacenamiento local o Amazon S3.

### 🚀 Características Principales

- **Exportación Selectiva**: Selecciona usuarios o sitios de SharePoint específicos para exportar.
- **Análisis de Integridad**: Comparación en tiempo real entre el origen (M365), el backup local y el tenant de destino.
- **Interfaz Moderna**: UI intuitiva construida con Next.js e iconos de Lucide (Actualmente en Español).
- **Soporte de Almacenamiento**: Exporta tus datos a discos locales o directamente a un bucket de S3.
- **Exportaciones Incrementales**: Descarga solo archivos nuevos o modificados para ahorrar ancho de banda.

### 🛠 Prerrequisitos

Antes de usar M365 Exporter, necesitas:
1. **Azure App Registration**: Crea un registro en tu Microsoft Entra ID (Azure AD).
2. **Permisos de API (Tipo Aplicación)**:
   - **Tenant de Origen (Exportación)**:
     - `User.Read.All`, `Mail.Read`, `Files.Read.All`, `Sites.Read.All`
     - `Contacts.Read` (opcional), `MailboxSettings.Read` (opcional)
   - **Tenant de Destino (Importación y Comparación)**:
     - `User.Read.All`, `Mail.ReadWrite`, `Files.ReadWrite.All`, `Sites.ReadWrite.All`
     - `Contacts.ReadWrite` (opcional), `MailboxSettings.ReadWrite` (opcional)
3. **Secret del Cliente**: Genera un secreto para tu App Registration.

### ⚙️ Configuración e Instalación

1. **Clonar el repositorio**:
   ```bash
   git clone https://github.com/micerinos/mexporter.git
   cd MExporter
   ```

2. **Instalar dependencias**:
   ```bash
   npm install
   ```

3. **Ejecutar el servidor de desarrollo**:
   ```bash
   npm run dev
   ```
   Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

### 📖 Guía de Uso

#### 1. Configuración
Haz clic en el icono de **Ajustes (Engranaje)** para configurar tus entornos:
- **Tenant Origen**: Credenciales del tenant desde donde exportarás los datos.
- **Tenant Destino**: Credenciales del tenant donde importarás o realizarás comparaciones.
- **Almacenamiento**: Elige entre **Local** (especifica una ruta) o **S3** (proporciona el bucket y credenciales).

#### 2. Realizar Exportaciones
En el panel principal:
- **Seleccionar Elementos**: Navega por las pestañas "Usuarios" o "Sitios". Selecciona los elementos deseados.
- **Ajustes de Exportación**:
    - **Correos, Contactos, Reglas, OneDrive**: Elige qué tipos de datos incluir.
    - **Incremental**: Si está activo, solo descargará archivos nuevos o modificados.
- **Iniciar**: Haz clic en "Exportar Seleccionados". Puedes seguir el progreso en el "Dashboard de Tareas" a la derecha.
- **Análisis de Integridad**: Haz clic en el icono del escudo para comparar el backup local con los datos reales del tenant.

#### 3. Realizar Importaciones
Accede a la sección de **Importar** desde la barra de navegación:
- **Seleccionar Backup**: Explora tu almacenamiento para elegir la carpeta del usuario o sitio a restaurar.
- **Identificación de Destino**: Especifica el email o ID del destino en el tenant nuevo.
- **Seleccionar Datos**: Elige qué componentes importar (Correo, OneDrive, etc.).
- **Monitorizar**: El progreso se muestra en tiempo real con logs detallados de cada elemento transferido.
