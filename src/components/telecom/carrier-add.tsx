"use client";

import { Plus } from "lucide-react";
import { Button } from "@/ui/button";
import { CarrierDialog } from "./carriers";

export function CarrierAddButton({ people }: { people: { id: string; name: string }[] }) {
  return <CarrierDialog people={people} trigger={(open) => <Button variant="primary" onClick={open}><Plus className="size-3.5" /> New carrier</Button>} />;
}

export function CarrierEditButton({ carrier, people }: { carrier: Parameters<typeof CarrierDialog>[0]["carrier"]; people: { id: string; name: string }[] }) {
  return <CarrierDialog carrier={carrier} people={people} trigger={(open) => <Button variant="secondary" onClick={open}>Edit</Button>} />;
}
