---
title: "Geohashing, S2, H3 & Spatial Indexing"
description: "How systems answer 'find drivers within 1km' efficiently — geohashing, Google's S2, Uber's H3, R-trees, quadtrees. The trade-off between simplicity, accuracy, and query speed for location-based services."
---

> Topic: Key Concept · Category: Geo & Spatial · Difficulty: Intermediate

## TL;DR
Location-based services (Uber, DoorDash, Tinder, Zillow, Snapchat) ask **"find things near here"**. Common spatial indexing approaches:
- **Geohashing** — convert (lat, lon) to a base32 string where shared prefix = nearby points. Simple; non-uniform cell sizes near poles.
- **Google S2** — divide Earth's surface using **Hilbert curve over a cube projection**; cells nest hierarchically; uniform-ish on the sphere.
- **Uber H3** — divide Earth into **hexagons**; uniform, neighbor-friendly (hexagon neighbors all equidistant); used by Uber for rider/driver matching.
- **R-tree** — tree of bounding rectangles; classical spatial index in PostGIS, MySQL Spatial, ElasticSearch.
- **Quadtree / KD-tree** — recursively split space; conceptually simple; less common in production.

The interview-critical insight: **for "things within radius" queries, you usually combine a spatial index with a database query** — index narrows down candidates; DB filters precisely. **Hexagonal grids (H3) are the modern favorite** because hexagon neighbors are all the same distance away, unlike squares.

## What problem does it solve?
- **"Find drivers within 1km"** — without index = scan every driver.
- **"Show pins on map"** — bounding-box query.
- **Geo-fencing** — "alert when user enters region X."
- **Heatmaps** — group by spatial bucket.
- **Nearest-neighbor search** — find k closest points.
- **Spatial joins** — overlap of regions / lines.

## How they work

### Geohashing
- Interleave bits of (latitude, longitude) → base32 string.
- Prefix length controls precision: `9q9hv` ~ 4.9km × 4.9km cell.
- **Neighboring cells share prefix** (mostly).

```
Lat 37.7749, Lon -122.4194
→ 9q8yyk8ytpxr  (12 chars = ~3.7cm precision)
9q8yy is San Francisco area; 9q8 is broader Bay Area.
```

**Issues:**
- Cells aren't square (rectangular near poles, narrow lon-wise near equator).
- **Edge effect:** points just across a cell boundary look "far" by prefix but are close by distance. Solution: query 9 surrounding cells.

### Google S2
- Project Earth onto cube faces; divide each face with Hilbert space-filling curve.
- 64-bit cell ID encodes face + level + position.
- **Levels 0-30** — level 30 = ~1cm; level 12 = ~1km².
- Cells have **fairly uniform area** on the sphere.
- **Neighbor queries** efficient via Hilbert curve adjacency.

Used by: Google Maps, Foursquare, Pokemon Go.

### Uber H3
- Globe tiled with **hexagons** (with 12 pentagons to make geometry close).
- 16 resolution levels (resolution 9 ≈ 174m hexagon edge).
- **Hexagonal grid** has uniform neighbor distance — all 6 neighbors equidistant.
- **Cell ID** is 64-bit int.
- **Easy `kRing`** query: "this cell + N rings of neighbors."

Used by: Uber (riders / drivers / surge pricing), DoorDash, deck.gl visualizations.

### R-tree
- Tree of nested bounding rectangles.
- Insert / delete / range query in O(log N).
- Used by: PostGIS (`GIST USING gist (geom)`), MySQL spatial, MongoDB 2dsphere, ElasticSearch geo_shape, SQLite spatial, ArcGIS.

### Quadtree
- Recursively split square region into 4 quadrants until each cell has ≤ N points.
- Simple; less efficient than R-tree at large scale.

### KD-tree
- Recursive median-split alternating dimensions.
- Not great for inserts / deletes; rebuild periodically.

## When to use each (real-world examples)

### Geohashing
- **Simple "nearby"** queries with low precision needs.
- **Bucketing analytics** — "events per geohash-5 cell per hour."
- **Redis** geo commands (uses geohash).
- **Caching** — geohash as cache key for location-based suggestions.

### S2
- **Google Maps tile generation.**
- **Geo-features at multiple scales** — Foursquare venues at neighborhood / city / region.
- **Pokemon Go spawn cells.**

### H3
- **Uber rider-driver matching** — "find drivers in this hexagon + neighbors."
- **DoorDash demand heatmaps.**
- **Surge pricing zones.**
- **Mobility analytics.**

### R-tree
- **General-purpose spatial DB queries** — "all polygons intersecting this bbox."
- **PostGIS** — vast majority of spatial DB users.
- **GIS desktop tools.**

### Combined approach
- **Index by H3 cell** in DB.
- **Query: cell + neighbors** → narrow candidates.
- **Filter by precise distance** in app layer.

## Things to consider / Trade-offs

### Cell uniformity
- **Geohash:** rectangles, varies with latitude.
- **S2:** more uniform on sphere via cube projection.
- **H3:** hexagons; very uniform neighbor distance.
- **Hexagons > squares** for "neighbors": square has 4 edge-neighbors + 4 corner-neighbors at different distances; hexagons have 6 equidistant neighbors.

### Granularity
- Pick resolution / level based on query radius.
- Too fine → many cells to query.
- Too coarse → too many candidates to filter.

### Edge effect
- A point near a cell boundary is "far" from neighbors by prefix but close by actual distance.
- **Always query the cell + neighbors** for radius queries.

### Distance precision
- Cell-based indexing gives **rough** filter; final filter must use Haversine / Vincenty for accurate distance.
- Cell index = "candidates within ~2 cells"; SQL filters precisely.

### Sphere vs flat
- **Earth is a sphere** — at large distances, flat-Earth math fails.
- **Haversine formula** for great-circle distance.
- **Mercator projection** for visualization, NOT for distance math.

### Hexagon math
- **Hexagon ≠ regular polygon on a sphere** — H3 uses 12 pentagons to fill the gaps.
- **Pentagon cells** have weird neighbor count (5).
- **`gridDistance` and `kRing`** are constant-time.

### R-tree vs grid
- **R-tree** for arbitrary shapes (polygons, lines).
- **H3 / S2 / geohash** for points + uniform analysis.
- **Combine:** R-tree for shape data, H3 for point density / heatmap.

### Real-time updates
- **Drivers move every few seconds** — need fast updates.
- **Redis geo + pub/sub** — driver pings Redis with new location; consumers query.
- **In-memory grids** for hot regions.

### Storage
- **H3 cell IDs** are 64-bit ints; tiny.
- **Geohash strings** vary by precision (5-12 chars).
- **R-tree** in DB index.

## Common pitfalls
- **Single-cell query missing neighbors** — point near boundary not found.
- **Wrong granularity** — query 1cm cells for 50km radius search.
- **Treating geohash prefix as "distance"** — close-prefix ≠ close-distance always.
- **Mercator distance math** — "11px on the map = 1km" only at the equator.
- **Not handling pentagons in H3** — neighbor count = 5 sometimes.
- **R-tree on millions of points without proper bounds** — slow.
- **Computing distance on every record** — should be filtered first.
- **Forgetting Earth's curvature** at scale — Haversine, not Pythagoras.
- **Real-time location updates** without spatial sharding — write hot spots.
- **Memory blowup** with very-fine-grained cells × many points.
- **Pessimizing with Haversine on every row** — use bounding box first.
- **Cell ID type mismatch** — H3 64-bit int vs string forms; always document.
- **Spatial join performance** — without proper R-tree / GiST index, full scan.
- **No clustering for time-series + space** — all driver pings hash to same cell ID.
- **Global → local conversion** — UTM zones, web Mercator math; pick the right projection.

## Interview Cheat Sheet
- **Geohashing:** base32 string from (lat, lon); prefix = nearby; rectangles, non-uniform.
- **S2 (Google):** Hilbert curve over cube; uniform-ish on sphere; multi-resolution cells.
- **H3 (Uber):** hexagons; uniform neighbor distance; standard for rider/driver matching.
- **R-tree:** classic spatial index for arbitrary shapes; PostGIS / MySQL Spatial / Mongo 2dsphere.
- **Always query cell + neighbors** to handle edge effect.
- **Cell index = candidates; precise distance = post-filter** with Haversine.
- **Hexagons preferred** because all 6 neighbors equidistant.
- **Real-time location:** Redis geo / in-memory H3 grid.
- **Earth is a sphere** — Haversine, not Pythagoras.
- **Killer phrase:** "Index by H3 cell + ring of neighbors gives you a fast O(1) candidate set; final Haversine filter gives you precise distance."

## Related concepts
- [Sharding & Partitioning](/docs/42-data-distribution/sharding-and-partitioning) — partition by spatial cell.
- [Caching Strategies](/docs/41-caching/caching-strategies) — cache by geohash / cell ID.
- [Search & Indexing](/docs/06-search-and-indexing/elasticsearch) — geo-spatial search.
- Concrete: [PostgreSQL](/docs/01-relational-databases/postgresql) + PostGIS, [MongoDB](/docs/04-document-stores/mongodb) 2dsphere, [Redis](/docs/02-key-value-stores/redis) GEO commands, [ElasticSearch](/docs/06-search-and-indexing/elasticsearch) geo queries.
