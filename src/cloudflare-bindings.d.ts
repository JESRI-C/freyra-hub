declare module "cloudflare:workers" {
  export const env: import("@/lib/drone-vision-provider.server").DroneVisionBindings;
}
