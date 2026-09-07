/**
 * Curated Google-Places-style business categories for the onboarding picker.
 *
 * This is a focused, searchable list (not the full Places taxonomy) covering the
 * categories most relevant to local competitor-review monitoring. Each entry has
 * a stable `id` and a human `label`.
 */

export interface BusinessCategory {
  id: string;
  label: string;
}

export const BUSINESS_CATEGORIES: BusinessCategory[] = [
  { id: "restaurant", label: "Restaurant" },
  { id: "cafe", label: "Café" },
  { id: "coffee_shop", label: "Coffee Shop" },
  { id: "bakery", label: "Bakery" },
  { id: "bar", label: "Bar" },
  { id: "pub", label: "Pub" },
  { id: "hotel", label: "Hotel" },
  { id: "guest_house", label: "Guest House" },
  { id: "resort", label: "Resort" },
  { id: "spa", label: "Spa" },
  { id: "hair_salon", label: "Hair Salon" },
  { id: "beauty_salon", label: "Beauty Salon" },
  { id: "gym", label: "Gym / Fitness Center" },
  { id: "yoga_studio", label: "Yoga Studio" },
  { id: "clothing_store", label: "Clothing Store" },
  { id: "boutique", label: "Boutique" },
  { id: "grocery", label: "Grocery Store" },
  { id: "convenience_store", label: "Convenience Store" },
  { id: "book_store", label: "Bookstore" },
  { id: "art_gallery", label: "Art Gallery" },
  { id: "museum", label: "Museum" },
  { id: "tour_agency", label: "Tour Agency" },
  { id: "travel_agency", label: "Travel Agency" },
  { id: "real_estate", label: "Real Estate Agency" },
  { id: "dentist", label: "Dentist" },
  { id: "doctor", label: "Doctor / Clinic" },
  { id: "physiotherapist", label: "Physiotherapist" },
  { id: "lawyer", label: "Lawyer / Law Firm" },
  { id: "accounting", label: "Accountant" },
  { id: "car_repair", label: "Car Repair" },
  { id: "gas_station", label: "Gas Station" },
  { id: "electronics_store", label: "Electronics Store" },
  { id: "furniture_store", label: "Furniture Store" },
  { id: "home_goods_store", label: "Home Goods Store" },
  { id: "florist", label: "Florist" },
  { id: "jewelry_store", label: "Jewelry Store" },
  { id: "pet_store", label: "Pet Store" },
  { id: "veterinary_care", label: "Veterinarian" },
  { id: "night_club", label: "Night Club" },
  { id: "movie_theater", label: "Movie Theater" },
  { id: "bowling_alley", label: "Bowling Alley" },
  { id: "amusement_park", label: "Amusement Park" },
  { id: "tourist_attraction", label: "Tourist Attraction" },
  { id: "campground", label: "Campground" },
  { id: "rv_park", label: "RV Park" },
  { id: "car_rental", label: "Car Rental" },
  { id: "taxi_stand", label: "Taxi Stand" },
  { id: "auto_dealer", label: "Car Dealer" },
  { id: "bicycle_store", label: "Bicycle Store" },
  { id: "shoe_store", label: "Shoe Store" },
  { id: "shopping_mall", label: "Shopping Mall" },
  { id: "department_store", label: "Department Store" },
  { id: "pharmacy", label: "Pharmacy" },
  { id: "supermarket", label: "Supermarket" },
  { id: "liquor_store", label: "Liquor Store" },
  { id: "meal_takeaway", label: "Meal Takeaway" },
  { id: "meal_delivery", label: "Meal Delivery" },
  { id: "catering", label: "Catering" },
  { id: "event_venue", label: "Event Venue" },
  { id: "stadium", label: "Stadium" },
  { id: "university", label: "University" },
  { id: "school", label: "School" },
  { id: "library", label: "Library" },
  { id: "post_office", label: "Post Office" },
  { id: "bank", label: "Bank" },
  { id: "atm", label: "ATM" },
  { id: "insurance_agency", label: "Insurance Agency" },
  { id: "moving_company", label: "Moving Company" },
  { id: "plumber", label: "Plumber" },
  { id: "electrician", label: "Electrician" },
  { id: "general_contractor", label: "General Contractor" },
  { id: "roofing_contractor", label: "Roofing Contractor" },
  { id: "painter", label: "Painter" },
  { id: "locksmith", label: "Locksmith" },
];

/** Case-insensitive search across category labels. Empty query returns all. */
export function searchCategories(query: string): BusinessCategory[] {
  const q = query.trim().toLowerCase();
  if (!q) return BUSINESS_CATEGORIES;
  return BUSINESS_CATEGORIES.filter(
    (c) => c.label.toLowerCase().includes(q) || c.id.replace(/_/g, " ").includes(q),
  );
}

export function getCategory(id: string | undefined): BusinessCategory | undefined {
  if (!id) return undefined;
  return BUSINESS_CATEGORIES.find((c) => c.id === id);
}
