const state = {
  selectedDrugId: "paracetamol",
  selectedStrengthIndex: 1,
  selectedInjectableId: "ceftriaxone",
  selectedInjectableStrengthIndex: 2,
  currentScreen: "home",
};

const elements = {};

const patientFieldMap = {
  drug: {
    years: "yearsInput",
    months: "monthsInput",
    toggle: "actualWeightToggle",
    block: "actualWeightBlock",
    weight: "actualWeightInput",
    estimate: "estimatedWeightPanel",
  },
  injectable: {
    years: "injectableYearsInput",
    months: "injectableMonthsInput",
    toggle: "injectableActualWeightToggle",
    block: "injectableActualWeightBlock",
    weight: "injectableActualWeightInput",
    estimate: "injectableEstimatedWeightPanel",
  },
  fluid: {
    years: "fluidYearsInput",
    months: "fluidMonthsInput",
    toggle: "fluidActualWeightToggle",
    block: "fluidActualWeightBlock",
    weight: "fluidActualWeightInput",
    estimate: "fluidEstimatedWeightPanel",
  },
};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  bindEvents();
  renderRecentChips();
  renderSearchResults("");
  setSelectedDrug(state.selectedDrugId, false);
  setSelectedInjectable(state.selectedInjectableId, false);
  updateDrugDose();
  updateInjectableDose();
  updateFluidPlan();
  registerServiceWorker();
});

function cacheElements() {
  elements.searchInput = document.getElementById("searchInput");
  elements.searchSummary = document.getElementById("searchSummary");
  elements.searchResults = document.getElementById("searchResults");
  elements.recentChips = document.getElementById("recentChips");
  elements.settingsButton = document.getElementById("settingsButton");
  elements.navItems = Array.from(document.querySelectorAll(".nav-item"));
  elements.quickActions = Array.from(document.querySelectorAll(".quick-action"));
  elements.screens = Array.from(document.querySelectorAll(".screen"));

  elements.drugName = document.getElementById("drugName");
  elements.drugStatus = document.getElementById("drugStatus");
  elements.drugIndications = document.getElementById("drugIndications");
  elements.strengthPicker = document.getElementById("strengthPicker");
  elements.doseTitle = document.getElementById("doseTitle");
  elements.doseOutput = document.getElementById("doseOutput");
  elements.safetyOutput = document.getElementById("safetyOutput");

  elements.injectableName = document.getElementById("injectableName");
  elements.injectableStatus = document.getElementById("injectableStatus");
  elements.injectableIndications = document.getElementById("injectableIndications");
  elements.injectableDrugChips = document.getElementById("injectableDrugChips");
  elements.injectableStrengthPicker = document.getElementById("injectableStrengthPicker");
  elements.injectableDoseTitle = document.getElementById("injectableDoseTitle");
  elements.injectableDoseOutput = document.getElementById("injectableDoseOutput");
  elements.injectableSafetyOutput = document.getElementById("injectableSafetyOutput");

  elements.fluidTitle = document.getElementById("fluidTitle");
  elements.fluidOutput = document.getElementById("fluidOutput");
  elements.fluidSafetyOutput = document.getElementById("fluidSafetyOutput");
}

function bindEvents() {
  elements.searchInput.addEventListener("input", () => {
    renderSearchResults(elements.searchInput.value);
    activateScreen("search");
  });

  bindPatientControls("drug", updateDrugDose);
  bindPatientControls("injectable", updateInjectableDose);
  bindPatientControls("fluid", updateFluidPlan);

  elements.settingsButton.addEventListener("click", () => activateScreen("settings"));

  elements.navItems.forEach((button) => {
    button.addEventListener("click", () => activateScreen(button.dataset.screenTarget));
  });

  elements.quickActions.forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.action === "drug-dose") {
        activateScreen("drug-dose");
      } else if (button.dataset.action === "injectables") {
        activateScreen("injectables");
      } else if (button.dataset.action === "fluids") {
        activateScreen("fluids");
      } else if (button.dataset.action === "growth") {
        activateScreen("growth");
      }
    });
  });
}

function bindPatientControls(section, updateFn) {
  const refs = getPatientRefs(section);
  if (!refs.years || !refs.months || !refs.toggle || !refs.block || !refs.weight || !refs.estimate) {
    return;
  }

  refs.years.addEventListener("input", updateFn);
  refs.months.addEventListener("input", updateFn);
  refs.weight.addEventListener("input", updateFn);
  refs.toggle.addEventListener("change", () => {
    refs.block.classList.toggle("hidden", !refs.toggle.checked);
    updateFn();
  });

  refs.block.classList.toggle("hidden", !refs.toggle.checked);
}

function getPatientRefs(section) {
  const map = patientFieldMap[section];
  return {
    years: elements[map.years],
    months: elements[map.months],
    toggle: elements[map.toggle],
    block: elements[map.block],
    weight: elements[map.weight],
    estimate: elements[map.estimate],
  };
}

function getPatientContext(section) {
  const refs = getPatientRefs(section);
  const yearsRaw = refs.years?.value.trim() || "";
  const monthsRaw = refs.months?.value.trim() || "";
  const actualWeightRaw = refs.weight?.value.trim() || "";
  const hasAgeInput = yearsRaw !== "" || monthsRaw !== "";
  const years = Number(yearsRaw || 0);
  const months = Number(monthsRaw || 0);
  const ageMonths = hasAgeInput ? getAgeInMonths(years, months) : null;
  const actualWeight = actualWeightRaw === "" ? null : Number(actualWeightRaw);
  const usingActualWeight = Boolean(refs.toggle?.checked && Number.isFinite(actualWeight) && actualWeight > 0);
  const estimatedWeight = ageMonths === null ? null : estimateWeightFromAge(ageMonths);
  const weightKg = usingActualWeight ? actualWeight : estimatedWeight;

  return {
    years,
    months,
    ageMonths,
    actualWeight,
    estimatedWeight,
    weightKg,
    usingActualWeight,
  };
}

function activateScreen(screenName) {
  state.currentScreen = screenName;

  elements.screens.forEach((screen) => {
    screen.classList.toggle("active", screen.dataset.screen === screenName);
  });

  elements.navItems.forEach((item) => {
    item.classList.toggle("active", item.dataset.screenTarget === screenName);
  });
}

function getDrugById(drugId) {
  return window.DRZIX_DATA.drugs.find((entry) => entry.id === drugId) || null;
}

function getInjectableDrugs() {
  return window.DRZIX_DATA.drugs.filter((drug) => {
    const route = normalizeText(drug.route);
    const category = normalizeText(drug.category);
    return route.includes("iv im") || route.includes("iv") || category.includes("injection");
  });
}

function applyStatusBadgeStyle(element, status) {
  const normalized = normalizeText(status);
  element.className = "status-badge";

  if (normalized.includes("review")) {
    element.classList.add("warning");
  } else if (normalized.includes("need")) {
    element.classList.add("warning");
  } else {
    element.classList.add("success");
  }
}

function renderRecentChips() {
  elements.recentChips.innerHTML = window.DRZIX_DATA.recent
    .map((item) => `<span class="chip"><button type="button" data-drug-select="${item}">${item}</button></span>`)
    .join("");

  elements.recentChips.querySelectorAll("button[data-drug-select]").forEach((button) => {
    button.addEventListener("click", () => {
      const drug = window.DRZIX_DATA.drugs.find((entry) => entry.name === button.dataset.drugSelect);
      if (drug) {
        setSelectedDrug(drug.id);
        activateScreen("drug-dose");
      }
    });
  });
}

function renderSearchResults(query) {
  const results = findDrug(query);

  elements.searchSummary.textContent = query.trim()
    ? `${results.length} result${results.length === 1 ? "" : "s"} found for “${query.trim()}”.`
    : "Search to see matches.";

  if (!results.length) {
    elements.searchResults.innerHTML = `<div class="result-card-item"><h4>No matches yet</h4><p>Try a drug name, indication, or category.</p></div>`;
    return;
  }

  elements.searchResults.innerHTML = results
    .map(
      (drug) => `
        <button class="result-card-item" type="button" data-drug-id="${drug.id}">
          <div class="meta"><strong>${drug.name}</strong><span>${drug.category}</span><span>${drug.status}</span></div>
          <h4>${drug.indications.join(" • ")}</h4>
          <p>${drug.route} route · Minimum age: ${drug.age.minMonths} months</p>
        </button>
      `,
    )
    .join("");

  elements.searchResults.querySelectorAll("[data-drug-id]").forEach((button) => {
    button.addEventListener("click", () => {
      setSelectedDrug(button.dataset.drugId);
      activateScreen("drug-dose");
    });
  });
}

function renderSelectionButtons(container, items, selectedId, buttonClass, onSelect) {
  container.innerHTML = items
    .map((item) => {
      const active = item.id === selectedId ? "active" : "";
      return `<button type="button" class="${buttonClass} ${active}" data-option-id="${item.id}">${item.label}</button>`;
    })
    .join("");

  container.querySelectorAll("[data-option-id]").forEach((button) => {
    button.addEventListener("click", () => onSelect(button.dataset.optionId));
  });
}

function renderStrengthButtons(container, strengths, selectedIndex, onSelect) {
  container.innerHTML = `
    <div class="strength-group">
      <h4>Available strengths</h4>
      <div class="strength-options">
        ${strengths
          .map(
            (strength, index) => `
              <button type="button" class="strength-option ${index === selectedIndex ? "active" : ""}" data-strength-index="${index}">
                <strong>${strength.label}</strong>
                <span>${strength.form}</span>
              </button>
            `,
          )
          .join("")}
      </div>
    </div>
  `;

  container.querySelectorAll("[data-strength-index]").forEach((button) => {
    button.addEventListener("click", () => onSelect(Number(button.dataset.strength-index)));
  });
}

function setSelectedDrug(drugId, shouldUpdate = true) {
  const drug = getDrugById(drugId) || window.DRZIX_DATA.drugs[0];
  state.selectedDrugId = drug.id;
  state.selectedStrengthIndex = Math.min(state.selectedStrengthIndex, drug.strengths.length - 1);
  elements.drugName.textContent = drug.name;
  elements.drugStatus.textContent = drug.status;
  applyStatusBadgeStyle(elements.drugStatus, drug.status);
  elements.drugIndications.innerHTML = drug.indications.map((item) => `<span class="chip">${item}</span>`).join("");

  renderStrengthButtons(elements.strengthPicker, drug.strengths, state.selectedStrengthIndex, (index) => {
    state.selectedStrengthIndex = index;
    setSelectedDrug(state.selectedDrugId, true);
  });

  if (shouldUpdate) {
    updateDrugDose();
  }
}

function setSelectedInjectable(drugId, shouldUpdate = true) {
  const injectables = getInjectableDrugs();
  const drug = injectables.find((entry) => entry.id === drugId) || injectables[0] || window.DRZIX_DATA.drugs[0];
  state.selectedInjectableId = drug.id;
  state.selectedInjectableStrengthIndex = Math.min(state.selectedInjectableStrengthIndex, drug.strengths.length - 1);
  elements.injectableName.textContent = drug.name;
  elements.injectableStatus.textContent = drug.status;
  applyStatusBadgeStyle(elements.injectableStatus, drug.status);
  elements.injectableIndications.innerHTML = drug.indications.map((item) => `<span class="chip">${item}</span>`).join("");

  renderSelectionButtons(
    elements.injectableDrugChips,
    injectables.map((entry) => ({ id: entry.id, label: entry.name })),
    state.selectedInjectableId,
    "chip-button",
    (selectedId) => {
      state.selectedInjectableId = selectedId;
      state.selectedInjectableStrengthIndex = 0;
      setSelectedInjectable(selectedId, true);
    },
  );

  renderStrengthButtons(elements.injectableStrengthPicker, drug.strengths, state.selectedInjectableStrengthIndex, (index) => {
    state.selectedInjectableStrengthIndex = index;
    setSelectedInjectable(state.selectedInjectableId, true);
  });

  if (shouldUpdate) {
    updateInjectableDose();
  }
}

function renderWeightPanel(target, context) {
  if (context.ageMonths === null) {
    target.innerHTML = `
      <strong>WHO estimated weight</strong>
      <div class="metric">-- kg</div>
      <p>Enter age to estimate weight. Actual weight can be entered directly if known.</p>
    `;
    return;
  }

  target.innerHTML = `
    <strong>WHO estimated weight</strong>
    <div class="metric">${formatNumber(context.estimatedWeight, 1)} kg</div>
    <p>${context.usingActualWeight ? `Using actual weight ${formatNumber(context.actualWeight, 1)} kg.` : "Actual weight is optional. The estimate is shown for quick bedside use."}</p>
  `;
}

function renderDoseRows(target, plan) {
  target.innerHTML = `
    <div class="output-row"><strong>Dose</strong><span class="metric">${plan.doseText}</span></div>
    <div class="output-row"><strong>Selected strength</strong><span>${plan.strengthLabel}</span></div>
    <div class="output-row"><strong>Administration volume</strong><span class="metric">${plan.volumeText}</span></div>
    <div class="output-row"><strong>Frequency</strong><span>${plan.frequency}</span></div>
    <div class="output-row"><strong>Maximum daily dose</strong><span>${plan.dailyMaxText}</span></div>
    <div class="output-row"><strong>Route</strong><span>${plan.route}</span></div>
    <div class="output-row"><strong>Duration</strong><span>${plan.duration}</span></div>
  `;
}

function renderFluidRows(target, plan) {
  target.innerHTML = `
    <div class="output-row"><strong>Formula</strong><span>${plan.formulaLabel}</span></div>
    <div class="output-row"><strong>Maintenance</strong><span class="metric">${formatNumber(plan.maintenanceDailyMl, 1)} mL/day</span></div>
    <div class="output-row"><strong>Hourly rate</strong><span class="metric">${formatNumber(plan.hourlyMl, 1)} mL/hr</span></div>
    <div class="output-row"><strong>Bolus</strong><span>${formatNumber(plan.bolus20Ml, 1)} mL (20 mL/kg)</span></div>
    <div class="output-row"><strong>Cautious bolus</strong><span>${formatNumber(plan.bolus10Ml, 1)} mL (10 mL/kg)</span></div>
  `;
}

function renderSafetyStack(target, drug, plan, context) {
  const safety = getSafetyMessage(drug, context.ageMonths, context.weightKg, plan);
  const cards = [];

  cards.push(`
    <div class="warning-card ${safety.tone}">
      <p><strong>${safety.title}:</strong> ${safety.message}</p>
    </div>
  `);

  if (plan?.message) {
    cards.push(`
      <div class="warning-card warning">
        <p>${plan.message}</p>
      </div>
    `);
  }

  (drug.warnings || []).forEach((warning) => {
    cards.push(`
      <div class="warning-card warning">
        <p>${warning}</p>
      </div>
    `);
  });

  const alternatives = (drug.alternatives || []).length ? drug.alternatives.join(", ") : "No starter alternative loaded.";
  cards.push(`
    <div class="warning-card success">
      <p><strong>Alternative:</strong> ${alternatives}</p>
    </div>
  `);

  if (plan?.ageBandLabel) {
    cards.push(`
      <div class="warning-card success">
        <p><strong>Age band:</strong> ${plan.ageBandLabel}</p>
      </div>
    `);
  }

  target.innerHTML = cards.join("");
}

function updateDrugDose() {
  const drug = getDrugById(state.selectedDrugId);
  if (!drug) {
    return;
  }

  const context = getPatientContext("drug");
  const selectedStrength = drug.strengths[state.selectedStrengthIndex] || drug.strengths[0];
  const plan = calculateDrugPlan(drug, {
    ageMonths: context.ageMonths,
    weightKg: context.weightKg,
    selectedStrength,
  });

  renderWeightPanel(elements.estimatedWeightPanel, context);

  if (plan?.blocked) {
    elements.doseTitle.textContent = plan.title;
    elements.doseOutput.innerHTML = `
      <div class="warning-card ${plan.tone}">
        <p>${plan.message}</p>
      </div>
    `;
    elements.safetyOutput.innerHTML = `
      <div class="warning-card ${plan.tone}">
        <p><strong>${plan.title}:</strong> ${plan.message}</p>
      </div>
      <div class="warning-card success">
        <p><strong>Alternative:</strong> ${plan.alternative}</p>
      </div>
    `;
    return;
  }

  elements.doseTitle.textContent = `${drug.name} dose calculation`;
  renderDoseRows(elements.doseOutput, plan);
  renderSafetyStack(elements.safetyOutput, drug, plan, context);
}

function updateInjectableDose() {
  const drug = getDrugById(state.selectedInjectableId);
  if (!drug) {
    return;
  }

  const context = getPatientContext("injectable");
  const selectedStrength = drug.strengths[state.selectedInjectableStrengthIndex] || drug.strengths[0];
  const plan = calculateDrugPlan(drug, {
    ageMonths: context.ageMonths,
    weightKg: context.weightKg,
    selectedStrength,
  });

  renderWeightPanel(elements.injectableEstimatedWeightPanel, context);

  if (plan?.blocked) {
    elements.injectableDoseTitle.textContent = plan.title;
    elements.injectableDoseOutput.innerHTML = `
      <div class="warning-card ${plan.tone}">
        <p>${plan.message}</p>
      </div>
    `;
    elements.injectableSafetyOutput.innerHTML = `
      <div class="warning-card ${plan.tone}">
        <p><strong>${plan.title}:</strong> ${plan.message}</p>
      </div>
      <div class="warning-card success">
        <p><strong>Alternative:</strong> ${plan.alternative}</p>
      </div>
    `;
    return;
  }

  elements.injectableDoseTitle.textContent = `${drug.name} injectable dose`;
  elements.injectableDoseOutput.innerHTML = `
    <div class="output-row"><strong>Dose</strong><span class="metric">${plan.doseText}</span></div>
    <div class="output-row"><strong>Selected vial</strong><span>${plan.strengthLabel}</span></div>
    <div class="output-row"><strong>Withdraw</strong><span class="metric">${plan.volumeText}</span></div>
    <div class="output-row"><strong>Frequency</strong><span>${plan.frequency}</span></div>
    <div class="output-row"><strong>Route</strong><span>${plan.route}</span></div>
    <div class="output-row"><strong>Daily max</strong><span>${plan.dailyMaxText}</span></div>
    <div class="output-row"><strong>Duration</strong><span>${plan.duration}</span></div>
  `;

  renderSafetyStack(elements.injectableSafetyOutput, drug, plan, context);
}

function updateFluidPlan() {
  const context = getPatientContext("fluid");
  renderWeightPanel(elements.fluidEstimatedWeightPanel, context);

  if (!Number.isFinite(context.weightKg) || context.weightKg <= 0) {
    elements.fluidTitle.textContent = "Waiting for weight";
    elements.fluidOutput.innerHTML = `
      <div class="warning-card warning">
        <p>Enter age or actual weight to calculate maintenance fluids and bolus guidance.</p>
      </div>
    `;
    elements.fluidSafetyOutput.innerHTML = `
      <div class="warning-card warning">
        <p>Maintenance fluids need a usable weight estimate.</p>
      </div>
    `;
    return;
  }

  const plan = calculateFluidPlan(context.weightKg);
  elements.fluidTitle.textContent = "Maintenance fluid plan";
  renderFluidRows(elements.fluidOutput, plan);

  const cards = [];
  cards.push(`
    <div class="warning-card success">
      <p><strong>Maintenance note:</strong> ${plan.formulaLabel} · ${formatNumber(context.weightKg, 1)} kg child</p>
    </div>
  `);

  cards.push(`
    <div class="warning-card warning">
      <p><strong>Bolus guidance:</strong> ${formatNumber(plan.bolus20Ml, 1)} mL isotonic fluid over 15 to 20 minutes.</p>
    </div>
  `);

  cards.push(`
    <div class="warning-card warning">
      <p><strong>Cautious option:</strong> ${formatNumber(plan.bolus10Ml, 1)} mL may be considered when local protocol asks for smaller boluses.</p>
    </div>
  `);

  if (plan.capNote) {
    cards.push(`
      <div class="warning-card warning">
        <p>${plan.capNote}</p>
      </div>
    `);
  }

  cards.push(`
    <div class="warning-card success">
      <p><strong>Safety:</strong> Use isotonic fluid and follow local correction protocols for dehydration, shock, DKA, and other pediatric conditions.</p>
    </div>
  `);

  elements.fluidSafetyOutput.innerHTML = cards.join("");
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}
