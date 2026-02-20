import { NextResponse } from "next/server";
import { getGraphClientForTenant } from "@/lib/graph";
import { getStorage } from "@/lib/storage";
import path from "path";

export async function POST(req: Request) {
    try {
        const { config, storageConfig } = await req.json();
        const client = await getGraphClientForTenant(config);

        let siteList: any[] = [];

        try {
            // Approach 1: Try getAllSites
            const res = await client.api("/sites/getAllSites")
                .select("id,displayName,webUrl,name,siteCollection")
                .top(999)
                .get();
            siteList = res.value || [];
        } catch (e) {
            // Approach 2: Search fallback
            try {
                const resSearch = await client.api("/sites")
                    .search("*")
                    .select("id,displayName,webUrl,name,siteCollection")
                    .get();
                siteList = resSearch.value || [];
            } catch (e2) { }
        }

        // FILTER: Remove OneDrive sites (those containing '-my.sharepoint.com' or specific templates)
        // FILTER: Remove OneDrive sites and System sites
        siteList = siteList.filter(site => {
            const url = (site.webUrl || "").toLowerCase();
            const name = (site.displayName || "").toLowerCase();
            const internalName = (site.name || "").toLowerCase();

            // Skip OneDrive
            if (url.includes("-my.sharepoint.com") || url.includes("/personal/")) return false;

            // Skip System Sites / Internal Hubs
            const systemKeywords = ['search', 'app catalog', 'appcatalog', 'contenttypehub', 'hubsite', 'pointpublishing'];
            if (systemKeywords.some(kw => name.includes(kw) || internalName.includes(kw))) return false;

            if (url.endsWith('/portals/hub') || url.includes('/sites/appcatalog')) return false;

            return true;
        });

        if (storageConfig) {
            const storage = getStorage(storageConfig);
            const tenantPrefix = config.name ? config.name.replace(/[<>:"/\\|?*]/g, '_').trim() : '';

            const siteValues = await Promise.all(siteList.map(async (site: any) => {
                const rawSiteName = site.name || (site.webUrl ? site.webUrl.split('/').pop() : site.id);
                // Sanitize matches exporter.ts sanitizeFileName
                const siteName = rawSiteName.replace(/[<>:"/\\|?*]/g, '_').trim();
                const sitePath = path.join(tenantPrefix, 'sites', siteName);

                let isExported = false;
                try {
                    isExported = await storage.exists(sitePath);
                } catch (e) { }

                return {
                    ...site,
                    name: siteName,
                    isExported
                };
            }));
            return NextResponse.json(siteValues);
        }

        return NextResponse.json(siteList);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
