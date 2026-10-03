# Private delivery coverage configuration

Status: code foundation tested; exact Dubai geometry NEEDS BUSINESS INPUT. Do not derive coordinates from the screenshot or deploy test fixtures.

`DELIVERY_COVERAGE_FILE` is an optional absolute path to a private server JSON file. No live variable was set. Contents must be a strict GeoJSON `FeatureCollection` with `features`:

- Exactly one `Feature` with `properties: {id: <unique reviewed string>, role: "primary"}`.
- Zero or more Features with the same shape and `role: "exclusion"`.
- Each `geometry` is `Polygon` or `MultiPolygon`; GeoJSON order is `[longitude, latitude]`, WGS84; rings must close. First ring is exterior; subsequent rings are holes.
- No extra feature/properties/geometry fields; strip GIS metadata into a separate private provenance record before validating. Up to 50 features, 20 polygon rings, 1000 points/ring, 20 MultiPolygon members and 1MiB file. Large geometry requires an explicitly reviewed simplification, never guessed points.

Server validates file on startup. Missing file setting disables address eligibility; a specified unreadable/invalid file aborts startup. Main polygon exterior boundary is included; exclusions include their exterior edges/vertices. Holes are outside their polygon including their boundary. MultiPolygon components are a union. Geometry is checked for malformed rings/holes; independent GIS validation and business approval still required.

Coverage controls eligibility only. Existing `state.zones` active polygons determine exactly one price zone after coverage passes. Missing/overlapping zones block delivery even within the main outline. Load only business-reviewed pricing-zone boundaries/rates via the existing authorized administration workflow; no update was done in this task.

Address lookup currently also needs private `DELIVERY_VERIFIED_ADDRESSES_FILE`: an array of `{address, building, location: {lat, lng}}`. Trusted coordinate provenance must be documented privately; no customer PII should be committed or exposed in logs. The shared address normalizer has non-ASCII limitations requiring follow-up before broad Arabic-address activation. These records do not geocode arbitrary user input. Alternatively approve/implement a real forward GeoService adapter in a separate pass.

Activation prerequisites: exact primary outline; exact red exclusion(s); pricing polygons keyed to known IDs; known-address coordinate records or approved geocoder; resolved boundary/island/overlap cases and rates for any new areas. No fake coordinates are supplied here. The attached screenshot is intent only.

Future authorized activation: privately validate input with `deliveryCoverageSchema`; review known inside/excluded/outside/border locations; configure file paths and restart in isolated TEST; verify address correction, forged create/resume rejection, minimums, pickup and no payment mutation on rejection. Production activation/deployment remains separately authorized. Rollback to missing coverage keeps delivery blocked and pickup available; do not bypass geography to restore delivery.
