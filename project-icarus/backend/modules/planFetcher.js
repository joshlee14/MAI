// Use the global fetch available in Node.js 18+

// Base endpoint for CMS MA Plan Finder data
const CMS_ENDPOINT = 'https://data.cms.gov/resource/ma-plan-finder.json';

/**
 * Fetches plans from the CMS Plan Finder API and filters them based on the client profile.
 * @param {Object} profile - Client profile containing zip, chronicConditions, and desiredBenefits.
 * @returns {Promise<Array>} Filtered list of plan objects.
 */
export async function fetchPlans(profile) {
  const { zip, chronicConditions, desiredBenefits } = profile;

  // Build the query URL. We limit results to 50 for performance; adjust as needed.
  const url = new URL(CMS_ENDPOINT);
  url.searchParams.append('$limit', 50);

  // Prepare headers for Socrata API token if provided
  const headers = {};
  if (process.env.CMS_APP_TOKEN) {
    headers['X-App-Token'] = process.env.CMS_APP_TOKEN;
  }

  // Fetch data from CMS API
  const response = await fetch(url.toString(), { headers });
  if (!response.ok) {
    throw new Error(`CMS API request failed with status ${response.status}`);
  }
  const data = await response.json();

  // Filter plans based on ZIP code and desired benefits
  const filtered = data.filter((plan) => {
    // Check if the plan covers the provided ZIP code via zip_county_text or service area
    const coversZip = plan.zip_county_text && plan.zip_county_text.includes(zip);
    if (!coversZip) return false;
    // Apply desired benefits filtering; if user desires dental, ensure plan has a dental maximum > 0
    const dentalOk = !desiredBenefits?.includes('Dental') || Number(plan.dental_maximum || 0) > 0;
    const visionOk = !desiredBenefits?.includes('Vision') || Number(plan.vision_maximum || 0) > 0;
    const otcOk = !desiredBenefits?.includes('OTC') || Number(plan.otc_allowance || 0) > 0;
    const hearingOk = !desiredBenefits?.includes('Hearing') || Number(plan.hearing_aids || 0) > 0;
    const gymOk = !desiredBenefits?.includes('Gym') || Number(plan.fitness_benefit || 0) > 0;
    const insulinOk = !desiredBenefits?.includes('Insulin') || true; // Insulin coverage not directly available
    return dentalOk && visionOk && otcOk && hearingOk && gymOk && insulinOk;
  });

  // Map filtered plans to a simplified structure for the UI
  return filtered.map((plan) => ({
    id: `${plan.contract_id}-${plan.plan_id}`,
    planName: plan.plan_name,
    premium: Number(plan.monthly_premium || 0),
    starRating: plan.star_rating || 'N/A',
    dentalMax: Number(plan.dental_maximum || 0),
    visionMax: Number(plan.vision_maximum || 0),
    moop: Number(plan.max_out_of_pocket || 0),
  }));
}