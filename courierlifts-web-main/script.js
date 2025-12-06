// Courier Lifts · Orbit V2
// Simple local quote engine + UI wiring.
// No external APIs required; safe for Netlify static deploy.
// Future-ready: easy to swap in real distance + backend calls later.

(function () {
  const form = document.getElementById("quote-form");
  const messageEl = document.getElementById("quote-message");

  const previewPrice = document.getElementById("preview-price");
  const previewDistance = document.getElementById("preview-distance");
  const previewEta = document.getElementById("preview-eta");
  const previewPoints = document.getElementById("preview-points");

  const breakdownBase = document.getElementById("breakdown-base");
  const breakdownDistance = document.getElementById("breakdown-distance");
  const breakdownWeight = document.getElementById("breakdown-weight");
  const breakdownPriority = document.getElementById("breakdown-priority");
  const breakdownTotal = document.getElementById("breakdown-total");

  const footerYear = document.getElementById("footer-year");

  if (footerYear) {
    footerYear.textContent = new Date().getFullYear();
  }

  if (!form) {
    console.warn("[Courier Lifts] quote-form not found – script loaded on another page.");
    return;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearMessage();

    const data = readForm();
    const validationError = validate(data);

    if (validationError) {
      setMessage(validationError, "error");
      return;
    }

    const simulatedDistance = simulateDistance(data.pickup, data.dropoff);
    const quote = calculateQuote(data, simulatedDistance);

    updateUI(quote);
    persistLastQuote(quote);

    setMessage("Orbit V2 estimate generated. Backend can plug in here later.", "success");
  });

  function readForm() {
    const pickup = valueOf("pickup");
    const dropoff = valueOf("dropoff");
    const itemType = valueOf("item-type");
    const priority = valueOf("priority");
    const weight = Number(valueOf("weight"));
    const size = valueOf("size");
    const email = valueOf("email");
    const pilotOptIn = document.getElementById("pilot-opt-in")?.checked ?? false;

    return { pickup, dropoff, itemType, priority, weight, size, email, pilotOptIn };
  }

  function valueOf(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : "";
  }

  function validate(data) {
    if (!data.pickup || !data.dropoff) return "Please enter both pickup and dropoff locations.";
    if (!data.itemType) return "Select an item type so we can estimate the right vehicle.";
    if (!data.priority) return "Choose a delivery speed.";
    if (!data.weight || data.weight <= 0) return "Enter an estimated weight greater than 0.";
    if (!data.size) return "Select a size category.";
    if (data.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) {
      return "That email address doesn’t look right.";
    }
    return null;
  }

  // Crude local "distance" estimate using string lengths so we don’t need paid APIs.
  function simulateDistance(pickup, dropoff) {
    const base = Math.abs(pickup.length - dropoff.length);
    const extra = (pickup.length + dropoff.length) % 10;
    const rawMiles = 2 + base * 0.4 + extra * 0.7;
    return Math.min(Math.max(rawMiles, 3), 60); // clamp 3–60 miles
  }

  function calculateQuote(data, distanceMiles) {
    const baseFare = 12; // flat base fee

    // Distance factor
    let distanceRate = 1.35; // per mile
    if (distanceMiles > 30) distanceRate = 1.15;
    if (distanceMiles < 10) distanceRate = 1.5;
    const distanceCharge = distanceMiles * distanceRate;

    // Weight & size factor
    let weightFactor = 1;
    if (data.weight > 80 && data.weight <= 200) weightFactor = 1.2;
    else if (data.weight > 200) weightFactor = 1.45;

    if (data.size === "medium") weightFactor *= 1.1;
    if (data.size === "large") weightFactor *= 1.35;

    // Priority
    let priorityMultiplier = 1;
    let etaHours = Math.max(distanceMiles / 18, 0.8); // base ETA

    if (data.priority === "rush") {
      priorityMultiplier = 1.35;
      etaHours *= 0.7;
    } else if (data.priority === "overnight") {
      priorityMultiplier = 0.9;
      etaHours *= 1.3;
    }

    // Item type shaping (mild multiplier, can evolve later)
    let itemMultiplier = 1;
    if (data.itemType === "electronics") itemMultiplier = 1.15;
    if (data.itemType === "appliance" || data.itemType === "furniture") itemMultiplier = 1.2;
    if (data.itemType === "building") itemMultiplier = 1.1;

    let subtotal = (baseFare + distanceCharge) * weightFactor * priorityMultiplier * itemMultiplier;

    // Soft rounding + min floor
    subtotal = Math.max(subtotal, 18);
    const total = roundCurrency(subtotal);

    // Pilot points: rough 5% of price + bonus for rush
    let points = Math.round(total * 0.5);
    if (data.priority === "rush") points += 10;

    return {
      baseFare,
      distanceMiles,
      distanceRate,
      distanceCharge,
      weightFactor,
      priorityMultiplier,
      itemMultiplier,
      total,
      points,
      etaHours,
    };
  }

  function updateUI(quote) {
    if (previewPrice) previewPrice.textContent = formatCurrency(quote.total);
    if (previewDistance)
      previewDistance.textContent = `${quote.distanceMiles.toFixed(1)} mi @ ${formatCurrency(
        quote.distanceRate
      )}/mi`;
    if (previewEta) previewEta.textContent = formatEta(quote.etaHours);
    if (previewPoints) previewPoints.textContent = `${quote.points} pts`;

    if (breakdownBase) breakdownBase.textContent = formatCurrency(quote.baseFare);
    if (breakdownDistance) breakdownDistance.textContent = formatCurrency(quote.distanceCharge);
    if (breakdownWeight) breakdownWeight.textContent = `${quote.weightFactor.toFixed(2)}×`;
    if (breakdownPriority)
      breakdownPriority.textContent = `${quote.priorityMultiplier.toFixed(2)}× • item ${quote.itemMultiplier.toFixed(
        2
      )}×`;
    if (breakdownTotal) breakdownTotal.textContent = formatCurrency(quote.total);
  }

  function formatCurrency(value) {
    return `$${value.toFixed(2)}`;
  }

  function roundCurrency(value) {
    return Math.round(value * 100) / 100;
  }

  function formatEta(hours) {
    if (hours < 1) return "Under 1 hr window";
    if (hours <= 2) return "1–2 hr window";
    if (hours <= 5) return "2–5 hr window";
    return `${Math.round(hours)} hr window`;
  }

  function setMessage(text, type) {
    if (!messageEl) return;
    messageEl.textContent = text;
    messageEl.classList.remove("inline-message--error", "inline-message--success");
    if (type === "error") messageEl.classList.add("inline-message--error");
    if (type === "success") messageEl.classList.add("inline-message--success");
  }

  function clearMessage() {
    if (!messageEl) return;
    messageEl.textContent = "";
    messageEl.classList.remove("inline-message--error", "inline-message--success");
  }

  function persistLastQuote(quote) {
    try {
      const payload = {
        total: quote.total,
        distanceMiles: quote.distanceMiles,
        points: quote.points,
        timestamp: new Date().toISOString(),
      };
      localStorage.setItem("courierlifts:lastQuote", JSON.stringify(payload));
    } catch (err) {
      console.warn("[Courier Lifts] Unable to persist quote", err);
    }
  }
})();
