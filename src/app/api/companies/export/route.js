// src/app/api/companies/export/route.js
import { NextResponse } from "next/server";
import { api } from "@/server/http";
import { exportCompaniesCsv } from "@/server/companies";

export const GET = api(async () => {
  return new NextResponse(await exportCompaniesCsv(), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="atlas-companies-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
});
