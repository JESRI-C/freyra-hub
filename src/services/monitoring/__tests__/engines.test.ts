import { describe, it, expect } from "vitest";
import { evaluateRules } from "@/services/monitoring/quality-engine";
import { evaluateAlertRules } from "@/services/monitoring/alert-engine";

// Minimal factory helpers.
function device(overrides: Partial<any> = {}): any {
  return {
    id: "dev-1",
    name: "Sensor A",
    project_id: "p1",
    device_type: "sensor",
    status: "active",
    battery_level: 100,
    zone_id: null,
    last_seen_at: new Date().toISOString(),
    last_measurement_at: new Date().toISOString(),
    expected_interval_minutes: 60,
    ...overrides,
  };
}

function measurement(overrides: Partial<any> = {}): any {
  return {
    id: "m-1",
    device_id: "dev-1",
    parameter_id: "temp",
    value: 20,
    unit: "C",
    measured_at: new Date().toISOString(),
    received_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    latitude: 55,
    longitude: 12,
    quality_score: 1,
    quality_status: "ok",
    validation_flags: {},
    source_payload: null,
    ...overrides,
  };
}

function rule(overrides: Partial<any> = {}): any {
  return {
    id: "r-1",
    project_id: "p1",
    organization_id: null,
    data_source_id: null,
    parameter_key: null,
    name: "test",
    rule_type: "out_of_range",
    configuration: {},
    severity: "medium",
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("quality-engine.evaluateRules", () => {
  const now = new Date();

  it("detects out_of_range", () => {
    const rules = [rule({ rule_type: "out_of_range", configuration: { min: 0, max: 10 } })];
    const issues = evaluateRules(rules, {
      measurements: [measurement({ id: "m-1", value: 5 }), measurement({ id: "m-2", value: 42 })],
      devices: [device()],
      now,
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].measurementId).toBe("m-2");
    expect(issues[0].issueType).toBe("out_of_range");
  });

  it("detects missing_gps", () => {
    const rules = [rule({ rule_type: "missing_gps" })];
    const issues = evaluateRules(rules, {
      measurements: [
        measurement({ id: "m-1", latitude: null }),
        measurement({ id: "m-2", latitude: 55, longitude: 12 }),
      ],
      devices: [device()],
      now,
    });
    expect(issues.map((i) => i.measurementId)).toEqual(["m-1"]);
  });

  it("detects duplicates", () => {
    const rules = [rule({ rule_type: "duplicate" })];
    const t = "2026-07-05T10:00:00.000Z";
    const issues = evaluateRules(rules, {
      measurements: [
        measurement({ id: "m-1", measured_at: t, value: 5 }),
        measurement({ id: "m-2", measured_at: t, value: 5 }),
      ],
      devices: [device()],
      now,
    });
    expect(issues).toHaveLength(1);
  });

  it("detects stale_data at device level", () => {
    const rules = [rule({ rule_type: "stale_data", configuration: { max_minutes: 60 } })];
    const stale = new Date(now.getTime() - 5 * 60 * 60_000).toISOString();
    const issues = evaluateRules(rules, {
      measurements: [],
      devices: [device({ last_measurement_at: stale })],
      now,
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].deviceId).toBe("dev-1");
  });

  it("detects spike via z-score", () => {
    const rules = [rule({ rule_type: "spike", configuration: { z_threshold: 2 } })];
    const base = Array.from({ length: 20 }, (_, i) => measurement({ id: `m${i}`, value: 10 }));
    base.push(measurement({ id: "outlier", value: 200 }));
    const issues = evaluateRules(rules, { measurements: base, devices: [device()], now });
    expect(issues.some((i) => i.measurementId === "outlier")).toBe(true);
  });

  it("respects is_active=false", () => {
    const rules = [rule({ rule_type: "missing_gps", is_active: false })];
    const issues = evaluateRules(rules, {
      measurements: [measurement({ latitude: null })],
      devices: [device()],
      now,
    });
    expect(issues).toHaveLength(0);
  });
});

describe("alert-engine.evaluateAlertRules", () => {
  const now = new Date();
  function arule(overrides: Partial<any> = {}): any {
    return {
      id: "ar-1",
      project_id: "p1",
      organization_id: null,
      name: "test",
      description: null,
      trigger_type: "device_offline",
      condition: {},
      severity: "medium",
      notification_channels: ["in_app"],
      assignment_rule: null,
      action_template_id: null,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    };
  }

  it("fires device_offline when last_seen_at is old", () => {
    const old = new Date(now.getTime() - 10 * 60 * 60_000).toISOString();
    const alerts = evaluateAlertRules(
      [arule({ trigger_type: "device_offline", condition: { max_minutes: 60 } })],
      { devices: [device({ last_seen_at: old })], measurements: [], openIssueCount: 0, now },
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0].sourceId).toBe("dev-1");
  });

  it("fires low_battery", () => {
    const alerts = evaluateAlertRules(
      [arule({ trigger_type: "low_battery", condition: { threshold: 20 } })],
      { devices: [device({ battery_level: 10 })], measurements: [], openIssueCount: 0, now },
    );
    expect(alerts).toHaveLength(1);
  });

  it("fires missing_data when device has no recent measurements", () => {
    const alerts = evaluateAlertRules(
      [arule({ trigger_type: "missing_data", condition: { hours: 1 } })],
      { devices: [device()], measurements: [], openIssueCount: 0, now },
    );
    expect(alerts).toHaveLength(1);
  });

  it("fires low_data_quality when open issues exceed threshold", () => {
    const alerts = evaluateAlertRules(
      [arule({ trigger_type: "low_data_quality", condition: { max_open_issues: 5 } })],
      { devices: [device()], measurements: [], openIssueCount: 10, now },
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0].sourceType).toBe("project");
  });

  it("fires critical_reading outside interval", () => {
    const alerts = evaluateAlertRules(
      [arule({ trigger_type: "critical_reading", condition: { critical_min: 0, critical_max: 30 } })],
      {
        devices: [device()],
        measurements: [measurement({ id: "hot", value: 99 })],
        openIssueCount: 0,
        now,
      },
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0].sourceId).toBe("hot");
  });

  it("skips unknown trigger types", () => {
    const alerts = evaluateAlertRules(
      [arule({ trigger_type: "manual" })],
      { devices: [device()], measurements: [], openIssueCount: 0, now },
    );
    expect(alerts).toHaveLength(0);
  });
});
