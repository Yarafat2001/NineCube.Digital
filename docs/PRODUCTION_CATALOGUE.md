# Production catalogue import

Production previously had seven categories and ten coffee products. The development-only sample importer and separately prepared Bangladesh catalogue had never populated PostgreSQL.

Startup now imports an embedded offline bundle containing 43 categories and 183 products, with 195 images. The bundle combines the existing sourced product data, verified image mappings, laptop configurations and bundled kitchen sample. It includes descriptions, available specifications, category assignments, brand tags, source attribution and price-review metadata. Representative photographs retain their explicit label. It does not fetch supplier sites during startup or present historical/estimated seed prices as verified live quotes.

The import matches SKU or slug, adds missing records and fills empty metadata. It never resets existing stock, prices, product names, categories, images or descriptions, and does not write orders. Newly imported products have zero stock until an inventory manager records real availability. Existing coffee stock remains intact. A PostgreSQL transaction and advisory lock protect the whole import from partial writes and concurrent deployment importers.

The PostgreSQL migration corrects the image/category unique indexes to apply only where IsPrimary is true. Existing records are preserved; products can have multiple gallery images/category links while still rejecting a second primary row. Product images are packaged into the API's wwwroot/products directory, so both API-based mobile clients and the website can load them.

Preparation: `python tools/prepare-production-catalogue.py` rebuilds the embedded JSON from the existing source files and verifies sourced image hashes and image existence. Live, read-only validation: `python tools/verify-production-catalogue.py` checks the category tree and all 195 API image endpoints. Pass an alternate API base URL as its first argument to test a local container.

Validation against a disposable PostgreSQL 17 database: 43 categories, 183 products, 195 images, no missing product descriptions or primary image URLs, and exactly one primary category/image per product. All image endpoints responded successfully. Restarting after a simulated merchant stock, price and description edit left the complete product-table snapshot unchanged. The failed pre-migration gallery test also confirmed transaction rollback without partial category/product imports.
