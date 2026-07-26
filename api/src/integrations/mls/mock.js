/**
 * Mock MLS adapter shaped like a RESO Web API / IDX feed (spec §10). Returns raw
 * RESO-field records; the ingestion layer normalizes and quality-gates them.
 */
export function createMockMlsAdapter() {
  return {
    name: 'mock',
    async fetchListings() {
      return [
        {
          ListingKey: 'MLS-100234', // dup of a seeded listing — dedup should skip
          StandardStatus: 'Active',
          PropertyType: 'Residential',
          ListPrice: 268000,
          UnparsedAddress: '1201 Pine Ave, Cary, NC',
          Latitude: 35.79, Longitude: -78.78,
          BedroomsTotal: 4, BathroomsTotalInteger: 3.5, LivingArea: 1400,
        },
        {
          ListingKey: 'MLS-200500',
          StandardStatus: 'Active',
          PropertyType: 'Residential',
          ListPrice: 245000,
          UnparsedAddress: '77 Elmwood Dr, Durham, NC',
          Latitude: 35.98, Longitude: -78.91,
          BedroomsTotal: 3, BathroomsTotalInteger: 2, LivingArea: 1290,
        },
        {
          ListingKey: 'MLS-200501',
          StandardStatus: 'Active',
          PropertyType: 'Land',
          ListPrice: 60000,
          UnparsedAddress: 'Lot 22 Ridgeline, Raleigh, NC',
          Latitude: 35.81, Longitude: -78.65,
          BedroomsTotal: null, BathroomsTotalInteger: null, LivingArea: 9000,
        },
        {
          ListingKey: 'MLS-200502', // low quality: missing price — quality gate should reject
          StandardStatus: 'Active',
          PropertyType: 'Residential',
          ListPrice: 0,
          UnparsedAddress: '',
          Latitude: null, Longitude: null,
          BedroomsTotal: 3, BathroomsTotalInteger: 2, LivingArea: 1200,
        },
      ];
    },
  };
}
