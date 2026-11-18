import type { MapDevice } from "@/services/monitoring/map-devices-service";
const statuses = {
  online: "Online",
  partial: "Delvis forbindelse",
  attention: "Kræver opmærksomhed",
  offline: "Offline",
  not_activated: "Ikke aktiveret",
};
export function mapDevicePopup(device: MapDevice): HTMLDivElement {
  const root = document.createElement("div");
  root.className = "break-words [overflow-wrap:anywhere]";
  const title = document.createElement("strong");
  title.textContent = device.label;
  root.append(title);
  const line = (text: string) => {
    const node = document.createElement("div");
    node.textContent = text;
    root.append(node);
  };
  line(statuses[device.status]);
  if (device.measurement) {
    line(
      `${device.measurement.value}${device.measurement.unit ? " " + device.measurement.unit : ""}`,
    );
    line(`Målt: ${device.measurement.measuredAt}`);
    line(`Datakvalitet: ${device.measurement.qualityStatus}`);
  } else line("Ingen måling registreret");
  line(
    device.coordinates?.source === "measurement"
      ? `Position fra måling: ${device.coordinates.recordedAt}`
      : "Registreret enhedsposition – ikke en aktuel GPS-måling",
  );
  if (device.coordinates) line(`Position: ${device.coordinates.lat}, ${device.coordinates.lng}`);
  line(
    device.batteryPercent === null ? "Batteriniveau mangler" : `Batteri: ${device.batteryPercent}%`,
  );
  line(device.lastSeen ? `Sidst set: ${device.lastSeen}` : "Tidspunkt for seneste kontakt mangler");
  return root;
}
