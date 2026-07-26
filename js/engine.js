function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function formatNumber(value, digits = 1) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(digits).replace(/\.0+$/, "");
}

function getAgeInMonths(years, months) {
  const safeYears = Number.isFinite(years) ? Math.max(0, years) : 0;
  const safeMonths = Number.isFinite(months) ? Math.max(0, months) : 0;
  return safeYears * 12 + safeMonths;
}

function estimateWeightFromAge(months) {
  const table = [...window.DRZIX_DATA.whoWeight].sort((left, right) => left.months - right.months);

  if (!table.length) {
    return null;
  }

  if (!Number.isFinite(months) || months <= table[0].months) {
    return table[0].weightKg;
  }

  const lastIndex = table.length - 1;
  const lastEntry = table[lastIndex];

  if (months >= lastEntry.months) {
    const previous = table[lastIndex - 1] || lastEntry;
    const slope = previous.months === lastEntry.months ? 0 : (lastEntry.weightKg - previous.weightKg) / (lastEntry.months - previous.months);
    return lastEntry.weightKg + slope * (months - lastEntry.months);
  }

  for (let index = 0; index < table.length - 1; index += 1) {
    const left = table[index];
    const right = table[index + 1];

    if (months >= left.months && months <= right.months) {
      const span = right.months - left.months || 1;
      const ratio = (months - left.months) / span;
      return left.weightKg + (right.weightKg - left.weightKg) * ratio;
    }
  }

  return lastEntry.weightKg;
}

function findDrug(query) {
  const needle = normalizeText(query);
  if (!needle) {
    return [];
  }

  return window.DRZIX_DATA.drugs.filter((drug) => {
    const haystack = [
      drug.name,
      drug.category,
      ...(drug.aliases || []),
      ...(drug.indications || []),
    ]
      .map(normalizeText)
      .join(" ");

    return haystack.includes(needle);
  });
}

function findAgeBandDose(drug, ageMonths) {
  const bands = drug?.dose?.bands || [];
  if (!Number.isFinite(ageMonths)) {
    return null;
  }

  return bands.find((band) => {
    const minMonths = Number.isFinite(band.minMonths) ? band.minMonths : 0;
    const maxMonths = Number.isFinite(band.maxMonths) ? band.maxMonths : Infinity;
    return ageMonths >= minMonths && ageMonths <= maxMonths;
  }) || null;
}

function getStrengthReference(strength) {
  if (!strength) {
    return null;
  }

  const concentrationMg = Number(strength.concentrationMg);
  const concentrationMl = Number(strength.concentrationMl);

  if (Number.isFinite(concentrationMg) && concentrationMg > 0 && Number.isFinite(concentrationMl) && concentrationMl > 0) {
    return {
      concentrationMg,
      concentrationMl,
      form: strength.form || "",
      label: strength.label || "",
    };
  }

  return null;
}

function pickAgeSpecificAlternative(drug, ageMonths) {
  const rules = drug?.age?.alternativesByAge || drug?.alternativesByAge || [];
  if (!Number.isFinite(ageMonths)) {
    return null;
  }

  const rule = rules.find((entry) => {
    const minMonths = Number.isFinite(entry.minMonths) ? entry.minMonths : 0;
    const maxMonths = Number.isFinite(entry.maxMonths) ? entry.maxMonths : Infinity;
    return ageMonths >= minMonths && ageMonths <= maxMonths;
  });

  if (!rule) {
    return null;
  }

  return {
    name: rule.name || rule.drug || "Check local protocol",
    note: rule.note || rule.reason || "",
  };
}

function formatTabletOrLiquidDose(selectedStrength, doseMg) {
  const strengthReference = getStrengthReference(selectedStrength);
  if (!strengthReference) {
    return null;
  }

  const strengthForm = normalizeText(strengthReference.form);
  if (strengthForm.includes("tablet") || strengthForm.includes("capsule")) {
    const count = doseMg / strengthReference.concentrationMg;
    const unit = strengthForm.includes("capsule") ? "capsules" : "tablets";
    return `${formatNumber(count, 2)} ${unit}`;
  }

  const volumeMl = (doseMg / strengthReference.concentrationMg) * strengthReference.concentrationMl;
  return `${formatNumber(volumeMl, 2)} mL`;
}

function calculateDrugPlan(drug, options = {}) {
  if (!drug) {
    return null;
  }

  const ageMonths = Number.isFinite(options.ageMonths) ? Math.max(0, options.ageMonths) : null;
  const weightKg = Number.isFinite(options.weightKg) && options.weightKg > 0 ? options.weightKg : null;
  const selectedStrength = options.selectedStrength || null;
  const dose = drug.dose || {};
  const minimumAge = Number.isFinite(drug.age?.minMonths) ? drug.age.minMonths : null;

  if (minimumAge !== null && ageMonths !== null && ageMonths < minimumAge) {
    const ageAlternative = pickAgeSpecificAlternative(drug, ageMonths);
    const fallbackAlternative = (drug.alternatives && drug.alternatives[0]) || "Check local protocol";
    return {
      blocked: true,
      tone: "danger",
      title: "Not appropriate for this age group",
      message: `${drug.name} is below the starter minimum age in this build.`,
      alternative: ageAlternative?.name || fallbackAlternative,
      alternativeNote: ageAlternative?.note || "",
    };
  }

  if (dose.type === "perKg" && !weightKg) {
    return {
      blocked: true,
      tone: "warning",
      title: "Need a weight first",
      message: "Enter the actual weight or use the WHO estimate to calculate this dose.",
      alternative: (drug.alternatives && drug.alternatives[0]) || "Check local protocol",
      alternativeNote: "",
    };
  }

  if (dose.type === "ageBand" && ageMonths === null) {
    return {
      blocked: true,
      tone: "warning",
      title: "Enter age to select the band",
      message: "This medicine uses age-band dosing in the starter database.",
      alternative: (drug.alternatives && drug.alternatives[0]) || "Check local protocol",
      alternativeNote: "",
    };
  }

  const plan = {
    blocked: false,
    tone: "success",
    title: "Dose ready",
    message: "",
    doseText: "--",
    doseSummary: "",
    volumeText: "--",
    frequency: dose.frequency || "--",
    duration: dose.duration || "--",
    route: drug.route || "--",
    strengthLabel: selectedStrength?.label || "--",
    dailyMaxText: "--",
    ageBandLabel: "",
    alternative: (drug.alternatives && drug.alternatives[0]) || "Check local protocol",
    alternativeNote: "",
    unit: "mg",
  };

  if (dose.type === "perKg") {
    const rawDoseMg = weightKg * Number(dose.amountMgPerKg || 0);
    const cappedDoseMg = Number.isFinite(dose.maxSingleMg) ? Math.min(rawDoseMg, dose.maxSingleMg) : rawDoseMg;
    const dailyMaxMg = Number.isFinite(dose.maxDailyMgPerKg) ? weightKg * dose.maxDailyMgPerKg : null;

    plan.doseText = `${formatNumber(cappedDoseMg, 1)} mg`;
    plan.doseSummary = `${formatNumber(dose.amountMgPerKg, 2)} mg/kg/dose`;
    plan.dailyMaxText = Number.isFinite(dailyMaxMg) ? `${formatNumber(dailyMaxMg, 1)} mg/day` : "--";
    plan.message = Number.isFinite(dose.maxSingleMg) && rawDoseMg > dose.maxSingleMg
      ? `Calculated dose capped at the maximum single dose of ${formatNumber(dose.maxSingleMg, 1)} mg.`
      : "";

    const selectedDoseReference = getStrengthReference(selectedStrength);
    if (selectedDoseReference) {
      plan.volumeText = formatTabletOrLiquidDose(selectedStrength, cappedDoseMg) || "--";
    }
  } else if (dose.type === "ageBand") {
    const band = findAgeBandDose(drug, ageMonths);
    if (!band) {
      const ageAlternative = pickAgeSpecificAlternative(drug, ageMonths);
      return {
        blocked: true,
        tone: "danger",
        title: "Not appropriate for this age group",
        message: `${drug.name} has no age-band match for the entered age in this build.`,
        alternative: ageAlternative?.name || (drug.alternatives && drug.alternatives[0]) || "Check local protocol",
        alternativeNote: ageAlternative?.note || "",
      };
    }

    plan.ageBandLabel = band.label || "Age band";
    plan.frequency = band.frequency || plan.frequency;
    plan.duration = band.duration || plan.duration;
    plan.doseSummary = band.note || plan.doseSummary;

    if (Number.isFinite(band.amountMg)) {
      plan.doseText = `${formatNumber(band.amountMg, 1)} mg`;
      plan.unit = "mg";
      plan.volumeText = formatTabletOrLiquidDose(selectedStrength, band.amountMg) || "--";
    } else if (Number.isFinite(band.amount)) {
      plan.doseText = `${formatNumber(band.amount, 1)} ${band.unit || "units"}`;
      plan.unit = band.unit || "units";
      plan.volumeText = "--";
    }

    if (Number.isFinite(band.maxDailyMg)) {
      plan.dailyMaxText = `${formatNumber(band.maxDailyMg, 1)} mg/day`;
    }
  } else {
    const fixedAmount = Number.isFinite(dose.amountMg)
      ? dose.amountMg
      : Number.isFinite(dose.amount)
        ? dose.amount
        : null;

    if (fixedAmount === null) {
      return {
        blocked: true,
        tone: "warning",
        title: "Dose data missing",
        message: `${drug.name} needs a fixed dose value before it can be displayed.`,
        alternative: (drug.alternatives && drug.alternatives[0]) || "Check local protocol",
        alternativeNote: "",
      };
    }

    plan.doseText = `${formatNumber(fixedAmount, 1)} ${dose.unit || "mg"}`;
    plan.doseSummary = dose.note || plan.doseSummary;
    plan.frequency = dose.frequency || plan.frequency;
    plan.duration = dose.duration || plan.duration;
    plan.unit = dose.unit || "mg";
    plan.volumeText = "--";
  }

  return plan;
}

function getSafetyMessage(drug, ageMonths, weightKg, plan) {
  if (!drug) {
    return {
      tone: "warning",
      title: "Select a drug",
      message: "Search and select a pediatric medicine to begin the dose calculation.",
    };
  }

  if (plan?.blocked) {
    const safeMessage = plan.alternativeNote
      ? `${plan.message} Suggested option: ${plan.alternative}. ${plan.alternativeNote}`
      : plan.message;

    return {
      tone: plan.tone || "warning",
      title: plan.title,
      message: safeMessage,
      alternative: plan.alternative,
      alternativeNote: plan.alternativeNote || "",
    };
  }

  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    return {
      tone: "warning",
      title: "Need weight to calculate dose",
      message: "Enter an actual weight or use the WHO weight estimate shown on the screen.",
    };
  }

  if (Number.isFinite(ageMonths) && drug.age?.minMonths && ageMonths < drug.age.minMonths) {
    const ageAlternative = pickAgeSpecificAlternative(drug, ageMonths);
    const alternative = ageAlternative?.name || (drug.alternatives && drug.alternatives[0]) || "Check local protocol";
    const note = ageAlternative?.note || "";
    return {
      tone: "danger",
      title: "Not appropriate for this age group",
      message: note ? `${drug.name} is below the starter minimum age in this build. ${note}` : `${drug.name} is below the starter minimum age in this build. Consider ${alternative}.`,
      alternative,
      alternativeNote: note,
    };
  }

  return {
    tone: "success",
    title: "Dose ready",
    message: `${drug.name} is available in the current starter database and the calculation is ready to show.`,
  };
}

function calculateFluidPlan(weightKg) {
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    return null;
  }

  let maintenanceDailyMl;
  let formulaLabel;

  if (weightKg <= 10) {
    maintenanceDailyMl = weightKg * 100;
    formulaLabel = "100 mL/kg/day";
  } else if (weightKg <= 20) {
    maintenanceDailyMl = 1000 + (weightKg - 10) * 50;
    formulaLabel = "100 / 50 rule";
  } else {
    maintenanceDailyMl = 1500 + (weightKg - 20) * 20;
    formulaLabel = "100 / 50 / 20 rule";
  }

  let capped = maintenanceDailyMl;
  let capNote = "";

  if (weightKg > 60 && maintenanceDailyMl > 2400) {
    capped = 2400;
    capNote = "Maintenance fluid is capped at 2400 mL/day above 60 kg in this starter build.";
  }

  const hourly = capped / 24;
  const bolus20 = weightKg * 20;
  const bolus10 = weightKg * 10;

  return {
    formulaLabel,
    maintenanceDailyMl: capped,
    hourlyMl: hourly,
    bolus20Ml: bolus20,
    bolus10Ml: bolus10,
    capNote,
  };
}
