import { NextResponse } from "next/server";
import { getGraphClientForTenant } from "@/lib/graph";

export async function POST(req: Request) {
    try {
        const { config } = await req.json();
        if (!config) {
            return NextResponse.json({ error: "Config is required" }, { status: 400 });
        }

        const client = await getGraphClientForTenant(config);
        // Organization endpoint usually returns an array
        const orgResponse = await client.api("/organization").select("displayName,id").get();

        if (orgResponse.value && orgResponse.value.length > 0) {
            return NextResponse.json(orgResponse.value[0]);
        }

        return NextResponse.json({ displayName: config.name || 'Desconocido' });
    } catch (error: any) {
        console.error("Error fetching tenant info:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
