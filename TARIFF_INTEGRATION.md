# ANEEL Tariff Integration Implementation

## Overview

This document describes the implementation of automatic energy tariff filling using ANEEL's official open data. The integration maintains backward compatibility while adding automatic tariff fetching from the ANEEL CKAN API.

## Architecture

### Backend Services

#### 1. Tariff Normalization (`lib/tariff/normalize.ts`)
- `normalizePeriodName()`: Converts tariff period names to internal format
  - "Ponta" → "peak"
  - "Intermediária" → "intermediate"
  - "Fora de ponta" → "offPeak"
  - "Convencional" → "conventional"
- `normalizeNumber()`: Parses numbers with comma or dot separators
- `normalizeUnit()`: Handles unit conversions (R$/MWh → R$/kWh)
- `normalizeDistributorName()`: Normalizes distributor names

#### 2. ANEEL API Client (`lib/tariff/aneel-service.ts`)
- `fetchTariffsFromAneel()`: Main entry point for tariff fetching
- `queryAneelDatastore()`: CKAN API query with 20-second timeout
- `filterRecordsByQuery()`: Filters records by distributor, subgroup, tariff mode, and validity date
- `selectBestRecord()`: Selects the most recent tariff record
- `extractTariffs()`: Parses TE and TUSD components and sums them
- Handles missing fields gracefully with field name alternatives

#### 3. Caching (`lib/tariff/cache.ts`)
- Simple in-memory cache with 24-hour TTL
- Caches:
  - Distributor list (queried once per 24h)
  - Tariff results by query parameters (distributor/subgroup/mode/date)
- No external dependencies (Redis, node-cache)

### API Endpoints

#### GET `/api/tariffs/lookup`
Query parameters:
- `distributor` (required): Distributor name
- `subgroup` (required): Tariff subgroup (B1, B2, A1, etc.)
- `tariffMode` (required): Tariff modality (Tarifa Branca, Convencional, etc.)
- `consumerClass` (optional): Consumer class
- `referenceDate` (required): Date in YYYY-MM-DD format

Response on success (200):
```json
{
  "tariffs": {
    "distributor": "AES São Paulo",
    "subgroup": "B1",
    "tariffMode": "Tarifa Branca",
    "validFrom": "2026-01-01",
    "validUntil": "2026-12-31",
    "source": "ANEEL",
    "fetchedAt": "2026-08-03T20:46:00.000Z",
    "tariffs": {
      "peak": 1.45,
      "intermediate": 0.95,
      "offPeak": 0.75
    }
  }
}
```

Response on error:
- 400: Missing or invalid parameters
- 404: No tariff found for given criteria
- 502: ANEEL API error
- 504: Request timeout

#### GET `/api/tariffs/distributors`
No parameters required.

Response on success (200):
```json
{
  "distributors": ["AES São Paulo", "CEMIG", "Eletropaulo", ...]
}
```

### UI Components

#### AutomaticTariffPanel.tsx
New component for automatic tariff fetching:
- Distributor searchable dropdown with autocomplete
- Subgroup selector (common options: B1, B2, B3, A1, A2, A3, A4)
- Tariff mode selector (Tarifa Branca, Convencional, Azul, Verde)
- Reference date picker
- Loading and error states
- Display of validity dates and fetch timestamp
- ANEEL disclaimer message

#### WhiteTariffPanel.tsx (Updated)
- New tab selector: "Automático pela ANEEL" / "Manual"
- When automatic mode is selected, shows AutomaticTariffPanel
- Manual edit tracking:
  - Tracks which fields were edited after automatic fetch
  - Shows "Alterado manualmente" badge on edited fields
- "Atualizar tarifas" button to refresh from ANEEL
- Backward compatible with existing manual-only mode

## Data Model

### WhiteTariffConfig Extension
New optional fields added to track tariff source:

```typescript
interface WhiteTariffConfig {
  // ... existing fields ...
  
  // New fields for automatic tariff source
  tariffInputMode?: 'automatic' | 'manual';  // Default: 'manual'
  tariffSource?: 'ANEEL' | 'USER';            // Default: 'USER'
  distributor?: string;
  subgroup?: string;
  tariffMode?: string;
  consumerClass?: string;
  validFrom?: string;     // ISO 8601 date
  validUntil?: string;    // ISO 8601 date
  fetchedAt?: string;     // ISO 8601 timestamp
  manuallyEditedFields?: string[];
}
```

### Backward Compatibility
- Old projects with only manual tariff values are treated as:
  - `tariffInputMode: 'manual'`
  - `tariffSource: 'USER'`
- No database schema changes (residentialOptions is already JSONB)
- Default behavior remains manual entry

## Database Migration

File: `supabase/migrations/0069_tariff_source_tracking.sql`

**No schema changes required.** All new fields are stored in the existing `residential_options` JSONB column in the `projects` table.

## Environment Variables

```env
# ANEEL tariff resource ID in CKAN (optional, has hardcoded default)
ANEEL_TARIFF_RESOURCE_ID=fcf2906c-7c32-4b9b-a637-054e7a5234f4
```

## Testing

### Unit Tests
File: `lib/tariff/normalize.test.ts`

Coverage:
- Tariff period name normalization (all variants)
- Decimal number parsing (comma/dot/space separators)
- Distributor name normalization
- Unit conversion (R$/MWh → R$/kWh)
- Edge cases and unknown values

**All 18 tests passing**

### Running Tests
```bash
npm test                              # Run all tests
npm test -- lib/tariff/normalize.test.ts  # Run tariff tests only
```

## Verification Checklist

- [x] TypeScript strict mode passes: `npm run typecheck`
- [x] ESLint passes: `npm run lint`
- [x] All unit tests pass: `npm test`
- [x] Normalization handles accents and spacing
- [x] Unit conversion (MWh → kWh) correct
- [x] Tariff period names normalized correctly
- [x] Backward compatibility maintained
- [x] ANEEL API timeout handling (20s)
- [x] Cache TTL implementation (24h)
- [x] Manual edit tracking
- [x] Error states and messages

## Known Limitations

1. **Data structure assumptions**: The implementation assumes ANEEL's CKAN API maintains consistent field names (DsDistribuidora, VlrTE, VlrTUSD, etc.). Field name alternatives are provided as fallbacks.

2. **Single tariff record per query**: When multiple records match, the most recent by start date is selected. Complex rule-based selection (demand vs. consumption, subclasses) is not implemented.

3. **Consumption tariffs only**: Currently handles R$/kWh tariffs only. Demand tariffs (R$/kW) are explicitly excluded to avoid mixing units.

4. **No CEP-based lookup**: Requires manual distributor selection; no automatic distribution zone detection from ZIP code.

5. **Intermediate period specificity**: The implementation treats "Intermediária" as specific to Tarifa Branca. For other tariff modes, the intermediate tariff is not automatically populated.

## File Structure

```
lib/tariff/
├── normalize.ts           # Normalization utilities
├── normalize.test.ts      # Normalization tests
├── aneel-service.ts       # ANEEL API client
└── cache.ts              # Simple caching

app/api/tariffs/
├── lookup/
│   └── route.ts          # Tariff lookup endpoint
└── distributors/
    └── route.ts          # Distributor list endpoint

components/app/tabs/sizing/features/
├── AutomaticTariffPanel.tsx  # Automatic tariff UI
└── WhiteTariffPanel.tsx      # Updated main tariff panel
```

## Future Enhancements

1. **Demand tariffs**: Extend to support R$/kW demand components
2. **CEP-based lookup**: Integrate municipal CEP database for automatic distributor selection
3. **Tariff forecasting**: Cache multiple future dates for user planning
4. **Database persistence**: Cache tariff queries in PostgreSQL for offline availability
5. **Tariff alerts**: Notify users of significant tariff changes
6. **Historical tracking**: Store tariff history for comparison
