# Address location suggestions

Source: [nuhil/bangladesh-geocode](https://github.com/nuhil/bangladesh-geocode),
retrieved 15 October 2026. The bundled subset retains IDs, English names and
parent IDs: 8 divisions, 64 districts and 494 upazila records. Original license
and attribution are retained in LOCATION_LICENSE.txt (MIT, Nuhil Mehdy).

These are the source dataset's records, not a claim of a live official gazette.
Existing addresses with other locality spellings remain selectable and are not
rewritten. Changing division/district explicitly clears dependent fields.

The profile form uses these records as searchable suggestions and accepts unlisted
cities, thanas, villages and areas as free text.

Country formats and required fields come from the bundled
`../../../shared/address-countries.json` snapshot of Google's libaddressinput
metadata (252 countries and regions). The API embeds the same file. Attribution,
license and source hash are alongside it; refresh with
`python tools/import_address_metadata.py` from the repository root. No customer
address is sent to an external service. Bangladesh keeps division, district and
area requirements; other destinations use their country-specific requirements.
Saving an international address does not enable international delivery: checkout
currently accepts Bangladesh destinations only.
