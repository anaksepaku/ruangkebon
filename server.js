const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = 3000;
const SERVER_IP = "127.0.0.1";

// Middleware
app.use(cors());
app.use(express.json({ strict: false }));
app.use(express.static(path.join(__dirname, "public")));

// Data storage untuk semua sensor
let sensorData = {
  power: [],
  suhu: [],
  ph: [],
  tds: [],
  pompa: [],
};

let latestData = {
  power: {},
  suhu: {},
  ph: {},
  tds: {},
  pompa: { status: false, mode: "manual" },
};

let deviceStatus = {
  isOnline: false,
  lastSeen: null,
  deviceId: null,
};

const DEVICE_TIMEOUT = 30000;

// Function to validate data
function validateSensorData(data, type) {
  const validated = { ...data };

  switch (type) {
    case "power":
      if (isNaN(validated.voltage) || !isFinite(validated.voltage))
        validated.voltage = 0;
      if (isNaN(validated.current) || !isFinite(validated.current))
        validated.current = 0;
      if (isNaN(validated.power) || !isFinite(validated.power))
        validated.power = 0;
      if (isNaN(validated.energy) || !isFinite(validated.energy))
        validated.energy = 0;
      if (isNaN(validated.frequency) || !isFinite(validated.frequency))
        validated.frequency = 0;
      if (isNaN(validated.power_factor) || !isFinite(validated.power_factor))
        validated.power_factor = 0;
      break;

    case "suhu":
      if (isNaN(validated.suhu) || !isFinite(validated.suhu))
        validated.suhu = 0;
      if (isNaN(validated.kelembaban) || !isFinite(validated.kelembaban))
        validated.kelembaban = 0;
      if (isNaN(validated.heat_index) || !isFinite(validated.heat_index))
        validated.heat_index = 0;
      break;

    case "ph":
      if (isNaN(validated.ph) || !isFinite(validated.ph)) validated.ph = 7.0;
      break;

    case "tds":
      if (isNaN(validated.tds) || !isFinite(validated.tds)) validated.tds = 0;
      if (isNaN(validated.suhu_air) || !isFinite(validated.suhu_air))
        validated.suhu_air = 0;
      break;
  }

  return validated;
}

// Check device status
function checkDeviceStatus() {
  const now = Date.now();
  if (deviceStatus.lastSeen && now - deviceStatus.lastSeen > DEVICE_TIMEOUT) {
    deviceStatus.isOnline = false;
  }
}

setInterval(checkDeviceStatus, 5000);

// API Routes untuk semua sensor
app.post("/api/data/:sensorType", (req, res) => {
  const sensorType = req.params.sensorType;
  console.log(`📨 Data received for ${sensorType}:`, req.body);

  try {
    const validatedData = validateSensorData(req.body, sensorType);

    deviceStatus.isOnline = true;
    deviceStatus.lastSeen = Date.now();
    deviceStatus.deviceId =
      req.body.deviceId || `ESP32_${sensorType.toUpperCase()}`;

    const dataWithTime = {
      ...validatedData,
      timestamp: new Date().toLocaleTimeString(),
      date: new Date().toLocaleDateString(),
      deviceId: deviceStatus.deviceId,
      unix_timestamp: Date.now(),
    };

    latestData[sensorType] = dataWithTime;
    sensorData[sensorType].push(dataWithTime);

    if (sensorData[sensorType].length > 100) {
      sensorData[sensorType] = sensorData[sensorType].slice(-100);
    }

    res.json({
      message: `Data ${sensorType} received OK!`,
      status: "success",
      device_status: "online",
      server_ip: SERVER_IP,
    });
  } catch (error) {
    res.status(400).json({
      error: "Invalid data format",
      message: error.message,
      server_ip: SERVER_IP,
    });
  }
});

// Kontrol Pompa
app.post("/api/pompa/control", (req, res) => {
  const { action, mode } = req.body;
  console.log(`🔧 Pompa control: ${action}, mode: ${mode}`);

  latestData.pompa = {
    status: action === "on",
    mode: mode || "manual",
    last_updated: new Date().toISOString(),
    controlled_by: "web-dashboard",
  };

  res.json({
    status: "success",
    message: `Pompa ${action === "on" ? "dinyalakan" : "dimatikan"}`,
    data: latestData.pompa,
  });
});

// Get latest data per sensor
app.get("/api/latest/:sensorType", (req, res) => {
  const sensorType = req.params.sensorType;
  const response = {
    ...latestData[sensorType],
    device_status: deviceStatus,
    server_ip: SERVER_IP,
    sensor_type: sensorType,
  };
  res.json(response);
});

// Get all data per sensor
app.get("/api/all/:sensorType", (req, res) => {
  const sensorType = req.params.sensorType;
  res.json({
    data: sensorData[sensorType],
    count: sensorData[sensorType].length,
    sensor_type: sensorType,
    server_ip: SERVER_IP,
  });
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    server_ip: SERVER_IP,
    port: PORT,
    timestamp: new Date().toISOString(),
  });
});

// Reset data
app.delete("/api/reset/:sensorType", (req, res) => {
  const sensorType = req.params.sensorType;
  sensorData[sensorType] = [];
  latestData[sensorType] = {};

  res.json({
    message: `Data ${sensorType} reset successfully`,
    server_ip: SERVER_IP,
  });
});

// Serve static files dari public folder
app.use(express.static("public"));

// Redirect root ke dashboard
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Tambahkan endpoint ini di server.js sebelum app.listen

// Endpoint untuk status semua sensor
app.get("/api/status/all", (req, res) => {
  const status = {
    server: "online",
    timestamp: new Date().toISOString(),
    sensors: {},
  };

  sensors.forEach((sensorType) => {
    status.sensors[sensorType] = {
      online:
        latestData[sensorType] &&
        Object.keys(latestData[sensorType]).length > 0,
      lastUpdate: latestData[sensorType]?.unix_timestamp || null,
      data: latestData[sensorType] || {},
    };
  });

  res.json(status);
});

// Endpoint untuk health check yang lebih detail
app.get("/api/health/detailed", (req, res) => {
  const onlineSensors = Object.keys(latestData).filter(
    (sensor) => latestData[sensor] && Object.keys(latestData[sensor]).length > 0
  ).length;

  res.json({
    status: "healthy",
    server_ip: SERVER_IP,
    port: PORT,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    connected_sensors: onlineSensors,
    total_sensors: Object.keys(latestData).length,
    sensor_status: Object.keys(latestData).reduce((acc, sensor) => {
      acc[sensor] =
        latestData[sensor] && Object.keys(latestData[sensor]).length > 0
          ? "online"
          : "offline";
      return acc;
    }, {}),
  });
});

// Jalankan server
app.listen(PORT, "0.0.0.0", () => {
  console.log("=".repeat(60));
  console.log(`🏠 Ruang Kebon Smart Farming Dashboard`);
  console.log(`📍 Server: http://${SERVER_IP}:${PORT}`);
  console.log("=".repeat(60));
  console.log("📋 Available Pages:");
  console.log(`   📊 Dashboard : http://${SERVER_IP}:${PORT}/`);
  console.log(`   ⚡ Power     : http://${SERVER_IP}:${PORT}/power.html`);
  console.log(`   🌡️ Suhu      : http://${SERVER_IP}:${PORT}/suhu.html`);
  console.log(`   🧪 pH        : http://${SERVER_IP}:${PORT}/ph.html`);
  console.log(`   💧 TDS       : http://${SERVER_IP}:${PORT}/tds.html`);
  console.log(`   🔌 Pompa     : http://${SERVER_IP}:${PORT}/pompa.html`);
  console.log("=".repeat(60));
});
