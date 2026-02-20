import { NextRequest, NextResponse } from "next/server";
import { getStorage } from "@/lib/storage";
import path from "path";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { storageConfig, action, itemPath } = body;

        if (!storageConfig) {
            return NextResponse.json({ error: "No storage configuration provided" }, { status: 400 });
        }

        const storage = getStorage(storageConfig);

        if (action === "delete") {
            if (!itemPath) return NextResponse.json({ error: "No path provided" }, { status: 400 });
            await storage.rm(itemPath);
            return NextResponse.json({ success: true });
        }

        // Default action: LIST
        const items: any[] = [];

        const getStatus = async (relPath: string) => {
            const statusFile = path.join(relPath, '.import_status.json');
            if (await storage.exists(statusFile)) {
                try {
                    const buffer = await storage.readFile(statusFile);
                    return JSON.parse(buffer.toString('utf8'));
                } catch (e) {
                    return null;
                }
            }
            return null;
        };

        const getItemDetails = async (relPath: string, type: 'user' | 'site') => {
            const contents = await storage.readdir(relPath);
            const contentNames = contents.map(c => c.name);
            const detail: any = {
                hasEmails: contentNames.includes('emails'),
                hasContacts: contentNames.includes('contacts'),
                hasRules: contentNames.includes('rules'),
                hasOneDrive: contentNames.includes('onedrive'),
                libraries: []
            };

            // For sites, libraries are folders inside
            if (type === 'site') {
                detail.libraries = contents
                    .filter(c => c.isDir && !c.name.startsWith('.') && !['emails', 'contacts', 'rules', 'onedrive'].includes(c.name))
                    .map(c => c.name);
            }

            let exportDate: Date | null = null;
            const metaFile = path.join(relPath, '.export_metadata.json');
            if (await storage.exists(metaFile)) {
                try {
                    const metaBuffer = await storage.readFile(metaFile);
                    const meta = JSON.parse(metaBuffer.toString('utf8'));
                    if (meta.exportDate) exportDate = new Date(meta.exportDate);
                } catch (e) { }
            }

            // Estimate export date (mtime of the folder or newest file inside) as fallback
            if (!exportDate) exportDate = await storage.getMTime(relPath);
            if (!exportDate) {
                // Peek at some common file to get a date if the folder itself doesn't have one (common in S3)
                const peekFiles = ['.import_status.json', 'contacts/contacts.json', 'rules/rules.json'];
                for (const pf of peekFiles) {
                    const d = await storage.getMTime(path.join(relPath, pf));
                    if (d) {
                        exportDate = d;
                        break;
                    }
                }

                // If still no date, try to find ANY file's date in S3
                if (!exportDate && storageConfig.type === 's3') {
                    const deepContents = await storage.readdir(relPath);
                    if (deepContents.length > 0) {
                        exportDate = await storage.getMTime(path.join(relPath, deepContents[0].name));
                    }
                }
            }

            return { detail, exportDate };
        };

        // Multi-tenant scanning
        // First, check if root has 'users' or 'sites' (backward compatibility or single tenant)
        const rootItems = await storage.readdir("").catch(() => []);
        const rootItemNames = rootItems.map(i => i.name);

        const hasLegacy = rootItemNames.includes('users') || rootItemNames.includes('sites');

        let activeTenants: string[] = hasLegacy ? [''] : [];
        const otherTenantDirs = rootItems
            .filter(i => i.isDir && i.name !== 'users' && i.name !== 'sites' && i.name !== '.import_status.json')
            .map(i => i.name);
        activeTenants = [...activeTenants, ...otherTenantDirs];

        for (const tenant of activeTenants) {
            const tenantPrefix = tenant ? tenant : "";

            // Scan users for this tenant
            const usersSubPath = path.join(tenantPrefix, "users");
            const users = await storage.readdir(usersSubPath).catch(() => []);
            for (const userEntry of users) {
                if (!userEntry.isDir) continue;
                const user = userEntry.name;
                const userRelPath = path.join(usersSubPath, user);
                const { detail, exportDate } = await getItemDetails(userRelPath, 'user');

                items.push({
                    name: user,
                    tenant: tenant || 'Raíz (Single)',
                    type: "user",
                    path: userRelPath,
                    upn: user,
                    exportDate,
                    contents: detail,
                    importStatus: await getStatus(userRelPath)
                });
            }

            // Scan sites for this tenant
            const sitesSubPath = path.join(tenantPrefix, "sites");
            const sites = await storage.readdir(sitesSubPath).catch(() => []);
            for (const siteEntry of sites) {
                if (!siteEntry.isDir) continue;
                const site = siteEntry.name;
                const siteRelPath = path.join(sitesSubPath, site);
                const { detail, exportDate } = await getItemDetails(siteRelPath, 'site');

                items.push({
                    name: site,
                    tenant: tenant || 'Raíz (Single)',
                    type: "site",
                    path: siteRelPath,
                    upn: site,
                    exportDate,
                    contents: detail,
                    importStatus: await getStatus(siteRelPath)
                });
            }
        }

        // De-duplicate if same item appears in legacy and root (unlikely but safe)
        const uniqueItems = Array.from(new Map(items.map(item => [item.path, item])).values());

        return NextResponse.json(uniqueItems);
    } catch (error: any) {
        console.error("Export list error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
