export const DRONE_BATCH_INTAKE = {
  before: { schema_version: "gofreyra.drone-before-intake/v1", phase: "BEFORE" },
  neutral: { schema_version: "gofreyra.drone-intake/v1", phase: "UNCLASSIFIED" },
} as const;

export type DroneIntakeMode = keyof typeof DRONE_BATCH_INTAKE;
