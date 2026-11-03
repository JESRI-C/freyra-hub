import { z } from "zod";

export const workEquipmentKind = z.enum(["vehicle", "machine", "tool"]);
export const workEquipmentKindLabel = { vehicle: "Køretøj", machine: "Maskine", tool: "Værktøj" };
