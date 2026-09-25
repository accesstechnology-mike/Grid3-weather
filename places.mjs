// Places the page can show. Coordinates are never stored here: each place is
// geocoded live (Cobham from its postcode, everywhere else by name + country).
export const PLACES = [
  { id: "cobham", label: "Cobham", postcode: "KT11 2JW" },
  { id: "reykjavik", label: "Reykjavik", query: "Reykjavik", country: "IS" },
  { id: "oslo", label: "Oslo", query: "Oslo", country: "NO" },
  { id: "rome", label: "Rome", query: "Rome", country: "IT" },
  { id: "paris", label: "Paris", query: "Paris", country: "FR" },
  { id: "amsterdam", label: "Amsterdam", query: "Amsterdam", country: "NL" },
  { id: "new-york", label: "New York", query: "New York", country: "US" },
  { id: "toronto", label: "Toronto", query: "Toronto", country: "CA" },
  { id: "dubai", label: "Dubai", query: "Dubai", country: "AE" },
  { id: "singapore", label: "Singapore", query: "Singapore", country: "SG" },
];

export function placeById(id) {
  return PLACES.find((place) => place.id === id) || null;
}
