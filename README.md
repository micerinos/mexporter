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
     - `User.Read.All`
     - `Mail.Read`
     - `Files.Read.All`
     - `Sites.Read.All`
     - `Contacts.Read` (optional for contacts)
     - `MailboxSettings.Read` (optional for rules)
   - **Destination Tenant (Import & Comparison)**:
     - `User.Read.All`
     - `Mail.ReadWrite`
     - `Files.ReadWrite.All`
     - `Sites.ReadWrite.All`
     - `Contacts.ReadWrite` (optional)
     - `MailboxSettings.ReadWrite` (optional)
3. **Client Secret**: Generate a secret for your App Registration.

### ⚙️ Setup & Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/MExporter.git
   cd MExporter
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Environment Configuration**:
   Create a `.env` file in the root directory.

4. **Run the development server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) with your browser.

---

<a name="español"></a>
## Versión en Español

M365 Exporter es una herramienta web avanzada diseñada para facilitar la exportación selectiva y migración de datos de Microsoft 365. Permite a los administradores realizar copias de seguridad de buzones de correo, archivos de OneDrive y sitios de SharePoint directamente en almacenamiento local o Amazon S3.

### 🚀 Características Principales

- **Exportación Selectiva**: Selecciona usuarios o sitios de SharePoint específicos para exportar.
- **Análisis de Integridad**: Comparación en tiempo real entre el origen (M365), el backup local y el tenant de destino.
- **Interfaz Moderna**: UI intuitiva construida con Next.js e iconos de Lucide.
- **Soporte de Almacenamiento**: Exporta tus datos a discos locales o directamente a un bucket de S3.
- **Exportaciones Incrementales**: Descarga solo archivos nuevos o modificados para ahorrar ancho de banda.

### 🛠 Prerrequisitos

Antes de usar M365 Exporter, necesitas:
1. **Azure App Registration**: Crea un registro en tu Microsoft Entra ID (Azure AD).
2. **Permisos de API (Tipo Aplicación)**:
   - **Tenant de Origen (Exportación)**:
     - `User.Read.All`
     - `Mail.Read`
     - `Files.Read.All`
     - `Sites.Read.All`
     - `Contacts.Read` (opcional para contactos)
     - `MailboxSettings.Read` (opcional para reglas)
   - **Tenant de Destino (Importación y Comparación)**:
     - `User.Read.All`
     - `Mail.ReadWrite`
     - `Files.ReadWrite.All`
     - `Sites.ReadWrite.All`
     - `Contacts.ReadWrite` (opcional)
     - `MailboxSettings.ReadWrite` (opcional)
3. **Secret del Cliente**: Genera un secreto para tu App Registration.

### ⚙️ Configuración e Instalación

1. **Clonar el repositorio**:
   ```bash
   git clone https://github.com/tu-usuario/MExporter.git
   cd MExporter
   ```

2. **Instalar dependencias**:
   ```bash
   npm install
   ```

3. **Configuración de Entorno**:
   Crea un archivo `.env` en el directorio raíz.

4. **Ejecutar el servidor de desarrollo**:
   ```bash
   npm run dev
   ```
   Abre [http://localhost:3000](http://localhost:3000) en tu navegador.
