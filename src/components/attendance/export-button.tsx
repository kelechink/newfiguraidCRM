"use client";

import { Download } from "lucide-react";
import { exportAttendanceAction } from "@/server/modules/attendance/actions";
import { Button } from "@/ui/button";
import { useToast } from "@/ui/toast";
import { downloadText } from "@/ui/download";

export function AttendanceExportButton({ month }: { month: string }) {
  const toast = useToast();
  return (
    <Button
      variant="secondary"
      onClick={async () => {
        const res = await exportAttendanceAction(month);
        if (!res.ok) return toast({ tone: "error", title: res.error });
        downloadText(res.data.filename, res.data.csv, "text/csv");
      }}
    >
      <Download className="size-3.5" /> Export month
    </Button>
  );
}
