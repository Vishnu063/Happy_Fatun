# Product viewing: current image-only pilot

The latest owner instruction supersedes the earlier generic 3D roadmap: **do not create GLB or 3D models; defer full 360° until matching image frames exist**. This initial release uses responsive static galleries with zoom, keyboard and touch. Five original AI concepts have one view each; no unrelated images are offered as turntable frames.

Legacy `Viewer.tsx`, its dependency and stored model assignments are preserved to avoid unnecessary data loss/rework, but the public product page does not import or expose that renderer. The owner editor no longer offers generic geometry as a product presentation option. The previous three generic sofa/dining/desk shapes were demonstrations, never accurate product models. There is no model upload endpoint or GLB loader, and none is required for this pilot.

Future image-sequence work requires 24–36 licensed, manufacturer/owner-approved views of the exact same piece at evenly spaced angles. Fix lighting, camera height, focal length, framing, dimensions, finish and background. Keep a manifest with stable product ID, count/order, rights and approval. Optimize bounded WebP frames and lazy-load after an explicit viewing action; support keyboard/touch, loading failures, reduced motion and the ordinary gallery fallback. Do not enable a rotation control until the actual matching sequence is verified. No such sequence or viewer is implemented here.

[Asset provenance and suggested frame filenames](../public/assets/pilot/README.md) and [pilot scope](PILOT_CATALOG_SUPPLIERS.md) describe the five original concepts, retained records and remaining owner inputs. These documents make no claim of real stock, approved manufacturing specifications or full rotation coverage.
