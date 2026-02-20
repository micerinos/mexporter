import { NextResponse } from "next/server";
import { getGraphClientForTenant } from "@/lib/graph";
import { getStorage } from "@/lib/storage";
import path from "path";

export async function POST(req: Request) {
    try {
        const { config, storageConfig } = await req.json();
        const client = await getGraphClientForTenant(config);
        const users = await client.api("/users")
            .filter("userType eq 'Member'")
            .select("id,displayName,userPrincipalName,mail")
            .top(999)
            .get();

        const filteredUsers = users.value.filter((u: any) => {
            const upn = (u.userPrincipalName || '').toLowerCase();
            const name = (u.displayName || '').toLowerCase();

            // Filter out external users
            if (upn.includes('#ext#')) return false;

            // Filter out system accounts
            if (name.startsWith('on-premises') || name.includes('sync service')) return false;
            if (upn.startsWith('admin@') || upn.startsWith('sync@')) return false;
            if (name.includes('system') || name.includes('administrador')) return false;

            return true;
        });

        if (storageConfig) {
            const storage = getStorage(storageConfig);
            const tenantPrefix = config.name ? config.name.replace(/[<>:"/\\|?*]/g, '_').trim() : '';

            const userValues = await Promise.all(filteredUsers.map(async (user: any) => {
                const userPath = path.join(tenantPrefix, 'users', user.userPrincipalName);
                return {
                    ...user,
                    isExported: await storage.exists(userPath)
                };
            }));
            return NextResponse.json(userValues);
        }

        return NextResponse.json(filteredUsers);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
