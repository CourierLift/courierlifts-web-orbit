const fetch = require("node-fetch");

exports.handler = async (event) => {
  try {
    const { origin, destination } = JSON.parse(event.body || "{}");
    if (!origin || !destination) {
      return { statusCode: 400, body: JSON.stringify({ error: "origin and destination required" }) };
    }

    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) {
      // Key not available to function runtime
      return { statusCode: 500, body: JSON.stringify({ error: "GOOGLE_MAPS_API_KEY missing in environment" }) };
    }

    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(
      origin
    )}&destinations=${encodeURIComponent(destination)}&units=metric&key=${key}`;

    const resp = await fetch(url);
    const data = await resp.json();

    // Log to Netlify function logs for debugging
    console.log("DistanceMatrix status:", data.status, data.error_message);
    const element = data?.rows?.[0]?.elements?.[0];
    const elStatus = element?.status;

    if (data.status !== "OK") {
      return { statusCode: 502, body: JSON.stringify({ error: "Google error", google_status: data.status, google_message: data.error_message || null }) };
    }
    if (elStatus !== "OK") {
      return { statusCode: 200, body: JSON.stringify({ distance_km: null, element_status: elStatus }) };
    }

    const meters = element.distance?.value;
    return { statusCode: 200, body: JSON.stringify({ distance_km: meters ? meters / 1000 : null }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};


