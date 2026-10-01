// Places the page can show. Coordinates are never stored here: each place is
// geocoded live (Cobham from its postcode, everywhere else by name + country).
export const PLACES = [
  { id: "cobham", label: "Cobham", postcode: "KT11 2JW" },
  { id: "nottingham", label: "Nottingham", query: "Nottingham", country: "GB" },
  { id: "london", label: "London", query: "London", country: "GB" },
  { id: "lagos", label: "Lagos", query: "Lagos", country: "NG" },
  { id: "san-diego", label: "San Diego", query: "San Diego", country: "US" },
];

export function placeById(id) {
  return PLACES.find((place) => place.id === id) || null;
}
