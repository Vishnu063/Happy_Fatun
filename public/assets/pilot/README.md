# Original pilot concept imagery

Five original AI-generated furniture concepts were created for Aaranya Living on 25 October 2026 UTC. No competitor photograph, supplier photograph, customer image, logo or external image was supplied as input. These are illustrative design proposals, not photographs of manufactured stock, proof of availability, or verified production specifications. Owner approval and manufacturer feasibility review remain necessary before presenting a design as an offered product.

Each prompt requested one complete piece in a warm white studio, natural oak/oat tones, premium restrained joinery, a three-quarter view, no text or logos, and a 4:3 composition:

| Files (prefix) | Original concept | Generated design brief |
| --- | --- | --- |
| `dining` | Vana pedestal dining table | Rounded oak dining top with sculptural twin pedestal base |
| `beds` | Nila curved oak bed | Softly curved oak bed frame and upholstered headboard |
| `wardrobes` | Reva fluted wardrobe | Tall oak wardrobe with fluted doors and restrained hardware |
| `chairs` | Tara oak lounge chair | Curved oak frame with neutral upholstered seat/back |
| `coffee` | Pebble oval coffee table | Low oval oak top and rounded sculptural supports |

The generated PNG originals remain in the task workspace outside the repository. ImageMagick performed only resizing, metadata stripping and WebP encoding. Each `*-studio.webp` is 1200 × 900, below 100 KB; each `*-card.webp` is 480 × 360, below 20 KB. `FurnitureImage` uses responsive srcsets, lazy loading outside the hero, explicit dimensions and asynchronous decoding. Asset tests verify WebP format/dimensions and size budgets. Retained legacy SVGs remain original vector illustrations.

There is only **one view per concept**. No room-view/photo pairing, model, rotation frames, GLB or working image-sequence 360 viewer was generated or claimed. The public gallery labels concepts and disables unavailable navigation. No supplier partnership, Pune stock or shipping/service area is implied by these assets.

Future matched views must show the exact same approved furniture, finish, dimensions and camera setup. For an approved image sequence, collect 24–36 consistent turntable frames at evenly spaced angles with fixed lighting/background and documented rights. Suggested path: `products/<stable-product-id>/turntable/frame-000.webp` through `frame-023.webp` (or `frame-035.webp`). Keep a manifest with frame count/order, product ID, capture/creator attribution, rights/approval and dimensions. Validate actual matching frames before implementing or enabling image-sequence rotation. The owner's earlier collage is not attached to this workspace and was not used as an input.
