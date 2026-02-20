import { NextRequest, NextResponse } from "next/server";
import { M365Comparator } from "@/lib/comparator";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { item, targetId, destinationConfig, storageConfig, sourceConfig } = body;

        console.log("DEBUG API Compare:", {
            itemType: item?.type,
            itemPath: item?.path,
            targetId,
            hasSourceConfig: !!sourceConfig,
            hasDestConfig: !!destinationConfig,
            sourceName: sourceConfig?.name,
            destName: destinationConfig?.name
        });

        if (!item || !targetId || !storageConfig) {
            return NextResponse.json({ error: "Faltan parámetros esenciales para la comparación" }, { status: 400 });
        }

        console.log(`Iniciando comparación para: ${item.type} - ${item.path} -> ${targetId}`);
        const comparator = new M365Comparator(storageConfig);
        await comparator.initialize(destinationConfig, sourceConfig);

        let report;
        try {
            if (item.type === 'user') {
                report = await comparator.compareUser(item.path, targetId.trim(), item.upn);
            } else {
                report = await comparator.compareSite(item.path, targetId.trim(), item.upn);
            }
        } catch (err: any) {
            console.error("Error detallado en la comparación:", err);
            const status = err.statusCode || err.status || 500;
            const message = err.message || "Error desconocido";

            let extra = "";
            if (status === 403) {
                extra = " Asegúrate de que el App Registration tiene los permisos 'Mail.Read', 'Files.Read.All', 'Sites.Read.All' y 'User.Read.All' de tipo Aplicación.";
            }

            return NextResponse.json({ error: `Graph Error (${status}): ${message}.${extra}` }, { status: 500 });
        }

        return NextResponse.json(report);
    } catch (error: any) {
        console.error("API Comparison Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
