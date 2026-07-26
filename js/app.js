const state = {
  selectedDrugId: "paracetamol",
  selectedStrengthIndex: 1,
  currentScreen: "home",
};

const elements = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  bindEvents();
  renderRecentChips();
  renderSearchResults("");
  setSelectedDrug(state.selectedDrugId);
  updateAll();
  registerServiceWorker();
});

function cacheElements() {
  elements.searchInput = document.getElementById("searchInput");
  elements.searchSummary = document.getElementById("searchSummary");
  elements.searchResults = document.getElementById("searchResults");
  elements.recentChips = document.getElementById("recentChips");
  elements.yearsInput = document.getElementById("yearsInput");
  elements.monthsInput = document.getElementById("monthsInput");
  elements.actualWeightToggle = document.getElementById("actualWeightToggle");
  elements.actualWeightBlock = document.getElementById("actualWeightBlock");
  elements.actualWeightInput = document.getElementById("actualWeightInput");
  elements.estimatedWeightPanel = document.getElementById("estimatedWeightPanel");
  elements.drugName = document.getElementById("drugName");
  elements.drugStatus = document.getElementById("drugStatus");
  elements.drugIndications = document.getElementById("drugIndications");
  elements.strengthPicker = document.getElementById("strengthPicker");
  elements.doseTitle = document.getElementById("doseTitle");
  elements.doseOutput = document.getElementById("doseOutput");
  elements.safetyOutput = document.getElementById("safetyOutput");
  elements.navItems = Array.from(document.querySelectorAll(".nav-item"));
  elements.screens = Array.from(document.querySelectorAll(".screen"));
  elements.quickActions = Array.from(document.querySelectorAll(".quick-action"));
}

function bindEvents() {
  elements.searchInput.addEventListener("input", () => {
    renderSearchResults(elements.searchInput.value);
    activateScreen("search");
  });

  elements.yearsInput.addEventListener("input", updateAll);
  elements.monthsInput.addEventListener("input", updateAll);
  elements.actualWeightToggle.addEventListener("change", () => {
    elements.actualWeightBlock.classList.toggle("hidden", !elements.actualWeightToggle.checked);
    updateAll();
  });
  elements.actualWeightInput.addEventListener("input", updateAll);

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

function activateScreen(screenName) {
  state.currentScreen = screenName;

  elements.screens.forEach((screen) => {
    screen.classList.toggle("active", screen.dataset.screen === screenName);
  });

  elements.navItems.forEach((item) => {
    item.classList.toggle("active", item.dataset.screenTarget === screenName);
  });
}

function renderRecentChips() {
  elements.recentChips.innerHTML = window.DRZIX_DATA.recent
    .map(
      (item) => `<span class="chip"><button type="button" data-drug-select="${item}">${item}</button></span>`,
    )
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

function setSelectedDrug(drugId) {
  const drug = window.DRZIX_DATA.drugs.find((entry) => entry.id === drugId) || window.DRZIX_DATA.drugs[0];
  state.selectedDrugId = drug.id;
  state.selectedStrengthIndex = Math.min(state.selectedStrengthIndex, drug.strengths.length - 1);
  elements.drugName.textContent = drug.name;
  elements.drugStatus.textContent = drug.status;
  elements.drugIndications.innerHTML = drug.indications
    .map((item) => `<span class="chip">${item}</span>`)
    .join("");

  elements.strengthPicker.innerHTML = `
    <div class="strength-group">
      <h4>Available strengths</h4>
      <div class="strength-options">
        ${drug.strengths
          .map(
            (strength, index) => `
              <button type="button" class="strength-option ${index === state.selectedStrengthIndex ? "active" : ""}" data-strength-index="${index}">
                <strong>${strength.label}</strong>
                <span>${strength.form}</span>
              </button>
            `,
          )
          .join("")}
      </div>
    </div>
  `;

  elements.strengthPicker.querySelectorAll("[data-strength-index]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedStrengthIndex = Number(button.dataset.strengthIndex);
      setSelectedDrug(state.selectedDrugId);
      updateAll();
    });
  });
}

function updateAll() {
  const drug = window.DRZIX_DATA.drugs.find((entry) => entry.id === state.selectedDrugId);
  if (!drug) {
    return;
  }

  const years = Number(elements.yearsInput.value || 0);
  const months = Number(elements.monthsInput.value || 0);
  const ageMonths = getAgeInMonths(years, months);
  const actualWeight = Number(elements.actualWeightInput.value || 0);
  const estimatedWeight = estimateWeightFromAge(ageMonths);
  const weightKg = elements.actualWeightToggle.checked && actualWeight > 0 ? actualWeight : estimatedWeight;
  const selectedStrength = drug.strengths[state.selectedStrengthIndex] || drug.strengths[0];
  const dose = calculateDose(drug, weightKg, selectedStrength);
  const safety = getSafetyMessage(drug, ageMonths, weightKg);

  elements.estimatedWeightPanel.innerHTML = `
    <strong>WHO estimated weight</strong>
    <div class="metric">${formatNumber(estimatedWeight, 1)} kg</div>
    <p>${elements.actualWeightToggle.checked ? `Using actual weight ${formatNumber(actualWeight, 1)} kg.` : "Actual weight is optional. The estimate is shown for quick bedside use."}</p>
  `;

  elements.doseTitle.textContent = dose ? `${drug.name} dose calculation` : "Waiting for inputs";

  if (!dose) {
    elements.doseOutput.innerHTML = `<div class="warning-card warning"><p>Enter age and weight to calculate the dose.</p></div>`;
  } else {
    elements.doseOutput.innerHTML = `
      <div class="output-row"><strong>Required dose</strong><span class="metric">${formatNumber(dose.cappedDoseMg, 1)} mg</span></div>
      <div class="output-row"><strong>Selected strength</strong><span>${selectedStrength.label}</span></div>
      <div class="output-row"><strong>Administration volume</strong><span class="metric">${formatNumber(dose.volumeMl, 2)} mL</span></div>
      <div class="output-row"><strong>Frequency</strong><span>${drug.dose.frequency}</span></div>
      <div class="output-row"><strong>Maximum daily dose</strong><span>${formatNumber(dose.dailyMaxMg, 1)} mg/day</span></div>
      <div class="output-row"><strong>Route</strong><span>${drug.route}</span></div>
      <div class="output-row"><strong>Duration</strong><span>${drug.dose.duration}</span></div>
    `;
  }

  elements.safetyOutput.innerHTML = `
    <div class="warning-card ${safety.tone}"><p><strong>${safety.title}:</strong> ${safety.message}</p></div>
    ${drug.warnings.map((warning) => `<div class="warning-card warning"><p>${warning}</p></div>`).join("")}
    <div class="warning-card success"><p><strong>Alternative:</strong> ${(drug.alternatives || []).join(", ") || "No starter alternative loaded."}</p></div>
  `;
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}
