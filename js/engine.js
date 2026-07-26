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
    };
  }

  return null;
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
    return {
      blocked: true,
      tone: "danger",
      title: "Not appropriate for this age group",
      message: `${drug.name} is below the starter minimum age in this build.`,
      alternative: (drug.alternatives && drug.alternatives[0]) || "Check local protocol",
    };
  }

  if (dose.type === "perKg" && !weightKg) {
    return {
      blocked: true,
      tone: "warning",
      title: "Need a weight first",
      message: "Enter the actual weight or use the WHO estimate to calculate this dose.",
      alternative: (drug.alternatives && drug.alternatives[0]) || "Check local protocol",
    };
  }

  if (dose.type === "ageBand" && ageMonths === null) {
    return {
      blocked: true,
      tone: "warning",
      title: "Enter age to select the band",
      message: "This medicine uses age-band dosing in the starter database.",
      alternative: (drug.alternatives && drug.alternatives[0]) || "Check local protocol",
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

    const strengthReference = getStrengthReference(selectedStrength);
    if (strengthReference) {
      const volumeMl = (cappedDoseMg / strengthReference.concentrationMg) * strengthReference.concentrationMl;
      plan.volumeText = `${formatNumber(volumeMl, 2)} mL`;
    }
  } else if (dose.type === "ageBand") {
    const band = findAgeBandDose(drug, ageMonths);
    if (!band) {
      return {
        blocked: true,
        tone: "danger",
        title: "Not appropriate for this age group",
        message: `${drug.name} has no age-band match for the entered age in this build.`,
        alternative: (drug.alternatives && drug.alternatives[0]) || "Check local protocol",
      };
    }

    plan.ageBandLabel = band.label || "Age band";
    plan.frequency = band.frequency || plan.frequency;
    plan.duration = band.duration || plan.duration;
    plan.doseSummary = band.note || plan.doseSummary;

    if (Number.isFinite(band.amountMg)) {
      plan.doseText = `${formatNumber(band.amountMg, 1)} mg`;
      plan.unit = "mg";
      const strengthReference = getStrengthReference(selectedStrength);
      if (strengthReference) {
        const volumeMl = (band.amountMg / strengthReference.concentrationMg) * strengthReference.concentrationMl;
        plan.volumeText = `${formatNumber(volumeMl, 2)} mL`;
      }
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
    return {
      tone: plan.tone || "warning",
      title: plan.title,
      message: plan.message,
      alternative: plan.alternative,
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
    const alternative = (drug.alternatives && drug.alternatives[0]) || "Check local protocol";
    return {
      tone: "danger",
      title: "Not appropriate for this age group",
      message: `${drug.name} is below the starter minimum age in this build. Consider ${alternative}.`,
      alternative,
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
