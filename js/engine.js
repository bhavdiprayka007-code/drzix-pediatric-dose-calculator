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
  const table = window.DRZIX_DATA.whoWeight;
  let closest = table[0];

  for (const entry of table) {
    if (Math.abs(entry.months - months) < Math.abs(closest.months - months)) {
      closest = entry;
    }
  }

  return closest.weightKg;
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

function calculateDose(drug, weightKg, selectedStrength) {
  if (!drug || !drug.dose || !Number.isFinite(weightKg) || weightKg <= 0) {
    return null;
  }

  const doseMg = weightKg * drug.dose.amountMgPerKg;
  const cappedDoseMg = Math.min(doseMg, drug.dose.maxSingleMg || doseMg);
  const dailyMaxMg = weightKg * (drug.dose.maxDailyMgPerKg || drug.dose.amountMgPerKg);

  let volumeMl = null;
  if (selectedStrength && selectedStrength.concentrationMg && selectedStrength.concentrationMl) {
    volumeMl = (cappedDoseMg / selectedStrength.concentrationMg) * selectedStrength.concentrationMl;
  }

  return {
    doseMg,
    cappedDoseMg,
    dailyMaxMg,
    volumeMl,
  };
}

function getSafetyMessage(drug, ageMonths, weightKg) {
  if (!drug) {
    return {
      tone: "warning",
      title: "Select a drug",
      message: "Search and select a pediatric medicine to begin the dose calculation.",
    };
  }

  if (Number.isFinite(ageMonths) && drug.age?.minMonths && ageMonths < drug.age.minMonths) {
    const alternative = (drug.alternatives && drug.alternatives[0]) || "Check local protocol";
    return {
      tone: "danger",
      title: "Not appropriate for this age group",
      message: `${drug.name} is below the starter minimum age in this build. Consider ${alternative}.`,
    };
  }

  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    return {
      tone: "warning",
      title: "Need weight to calculate dose",
      message: "Enter an actual weight or use the WHO weight estimate shown on the screen.",
    };
  }

  return {
    tone: "success",
    title: "Dose ready",
    message: `${drug.name} is available in the current starter database and the calculation is ready to show.`,
  };
}
