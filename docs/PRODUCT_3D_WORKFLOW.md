# Product-specific 3D: current limits and future workflow

The current Three.js viewer constructs three generic demo shapes in code (sofa, dining table, desk). Twelve seeded designs reference those shapes; twelve use the image gallery alone. None has an accurate, manufacturer-approved product model. Camera controls do not make the geometry product-specific. Overall accurate 360° coverage is **PARTIAL**. There is currently **no GLB upload endpoint or model-file loader**.

The existing owner editor can choose a generic demo or disable it; it cannot upload a real model. Image upload accepts only validated raster images and must not be reused to smuggle model files into the site.

## Practical future implementation

1. Obtain a licensed, manufacturer-approved GLB for each product, with permission for public delivery. Check its shape, dimensions, materials and colorways against the actual product; record who approved it. Photograph-to-model conversion alone does not establish accuracy. Keep unapproved items as clearly marked concepts.
2. Agree a mobile budget before accepting files: initially target ≤5 MB compressed GLB, ≤100k triangles, ≤2048px textures and modest decoded texture memory. Test those limits on actual lower-memory phones. Prefer a self-contained GLB without external URLs, scripts or arbitrary embedded dependencies. Measure decoded size as well as download bytes.
3. Add a separate owner-only model manager using the existing authenticated/origin-protected API patterns. Validate container version, declared length, resource references and resource budgets server-side; reject external references and oversized content. Use a staging record and durable cleanup obligations as for images. Store bytes in R2, metadata/version/units/scale/poster and approved camera bounds in D1. Replacing a model must preserve product/quote IDs, prices, gallery and snapshots.
4. Add an on-demand GLTFLoader path to the existing viewer. Apply explicit units/scale; frame the approved bounds; retain horizontal/vertical orbit, pinch/zoom, reset and image fallback. Abort stale loads, release GPU textures/materials/geometry on navigation, and handle missing files/context loss. Keep accessible gallery and button controls available; do not require 3D for a quotation.
5. Test authorization, invalid containers, oversized/externally referenced resources, interrupted uploads, replacement/deletion cleanup, load failure and WebGL loss. On desktop and physical touch devices verify appearance against the approved reference, camera bounds, reset, zoom, touch rotation, memory and load time. The current demo-control browser tests cannot substitute for these product-accuracy checks.
6. Roll out only approved models. Keep a per-product coverage/approval inventory and explicit demo/fallback labels for the rest. No paid model service, account, deployment or asset accuracy is implied by this plan.

This is a documented implementation plan, not completed model-upload functionality. Owner-supplied approved assets are required before accurate coverage can be verified.
