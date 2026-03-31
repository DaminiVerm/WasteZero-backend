import Pickup from "../model/pickup.js";

const MATERIAL_ALIASES = {
  plastic: "plastic",
  "plastic waste": "plastic",
  metal: "metal",
  "metal waste": "metal",
  paper: "paper",
  "paper waste": "paper",
  glass: "glass",
  "glass waste": "glass",
  electronic: "electronic waste",
  electronics: "electronic waste",
  "electronic waste": "electronic waste",
  "e-waste": "electronic waste",
  ewaste: "electronic waste",
};

const normalizeValue = (value = "") =>
  value.toString().trim().toLowerCase();

const normalizeMaterial = (value = "") =>
  MATERIAL_ALIASES[normalizeValue(value)] || normalizeValue(value);

const normalizeLocationText = (value = "") =>
  value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const getCoordinates = (locationCoords) => {
  const coordinates = locationCoords?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length !== 2) return null;

  const [lng, lat] = coordinates.map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;

  return { lat, lng };
};

const toRadians = (value) => (value * Math.PI) / 180;

const calculateDistanceKm = (fromCoords, toCoords) => {
  if (!fromCoords || !toCoords) return null;

  const earthRadiusKm = 6371;
  const latDiff = toRadians(toCoords.lat - fromCoords.lat);
  const lngDiff = toRadians(toCoords.lng - fromCoords.lng);
  const fromLat = toRadians(fromCoords.lat);
  const toLat = toRadians(toCoords.lat);

  const a =
    Math.sin(latDiff / 2) ** 2 +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(lngDiff / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const getTextLocationScore = (volunteerLocation, opportunityLocation) => {
  const volunteerText = normalizeLocationText(volunteerLocation);
  const opportunityText = normalizeLocationText(opportunityLocation);

  if (!volunteerText || !opportunityText) return 0;
  if (volunteerText === opportunityText) return 100;
  if (opportunityText.includes(volunteerText) || volunteerText.includes(opportunityText)) return 85;

  const volunteerParts = volunteerText.split(" ").filter(Boolean);
  const opportunityParts = opportunityText.split(" ").filter(Boolean);
  const sharedParts = volunteerParts.filter((part) => opportunityParts.includes(part));

  if (sharedParts.length >= 2) return 70;
  if (sharedParts.length === 1) return 45;
  return 0;
};

export const getVolunteerPreferenceSet = async (user) => {
  const preferenceSet = new Set(
    (user.skills || []).map(normalizeMaterial).filter(Boolean)
  );

  const pickups = await Pickup.find({ volunteer: user._id }).select("wasteTypes");
  pickups.forEach((pickup) => {
    (pickup.wasteTypes || []).forEach((type) => {
      const normalized = normalizeMaterial(type);
      if (normalized) {
        preferenceSet.add(normalized);
      }
    });
  });

  return preferenceSet;
};

export const scoreOpportunityForVolunteer = async (volunteer, opportunity) => {
  const preferences = await getVolunteerPreferenceSet(volunteer);
  const opportunityWasteType = normalizeMaterial(opportunity.wasteType);
  const requiredSkills = (opportunity.requiredSkills || [])
    .map(normalizeMaterial)
    .filter(Boolean);

  const wasteMatch = opportunityWasteType && preferences.has(opportunityWasteType);
  const matchedSkills = requiredSkills.filter((skill) => preferences.has(skill));

  const volunteerCoords = getCoordinates(volunteer.locationCoords);
  const opportunityCoords = getCoordinates(opportunity.locationCoords);
  const distanceKm = calculateDistanceKm(volunteerCoords, opportunityCoords);
  const textLocationScore = getTextLocationScore(volunteer.location, opportunity.location);

  let score = 0;
  if (distanceKm !== null) {
    if (distanceKm <= 5) score += 100;
    else if (distanceKm <= 10) score += 85;
    else if (distanceKm <= 20) score += 70;
    else if (distanceKm <= 35) score += 55;
    else if (distanceKm <= 50) score += 35;
    else score += 10;
  } else {
    score += textLocationScore;
  }

  if (wasteMatch) score += 25;
  score += Math.min(matchedSkills.length * 10, 20);

  const isNearby = distanceKm !== null ? distanceKm <= 50 : textLocationScore >= 45;
  const isMatch = isNearby;

  return {
    isMatch,
    score,
    distanceKm,
    textLocationScore,
    wasteMatch,
    matchedSkills,
  };
};
