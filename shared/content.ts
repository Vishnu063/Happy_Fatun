/** Original, versioned editorial content; no external CMS, claims or generated bulk pages. */
export const guides = [
  {
    slug: "measure-for-furniture",
    title: "Measure your room before requesting furniture",
    description:
      "Check usable space, delivery access and clearance before sharing furniture dimensions for a quotation.",
    sections: [
      {
        title: "Measure the usable space",
        text: "Sketch the room and record wall lengths in centimetres. Mark doors, windows, sockets, skirting and fixed cabinets. Measure at floor level and at the height where the furniture will sit; walls and floors may not be perfectly square.",
      },
      {
        title: "Leave room to use the furniture",
        text: "Mark the proposed footprint with removable tape. Walk around it, pull out a chair and allow for doors or drawers to open. A footprint that fits on paper may still block everyday movement. Clearance depends on your room and users; ask the manufacturer to review your sketch rather than treating a generic measurement as a guarantee.",
      },
      {
        title: "Check the delivery route",
        text: "Record the narrowest doorway, stair turn and lift opening along the route. Ask whether the proposed item arrives assembled, whether sections can be separated and who handles assembly. Supply photos of difficult access only through an agreed private channel; the public product gallery is not a customer upload service.",
      },
      {
        title: "Share a request, then confirm",
        text: "Include proposed length, width and height, preferred material and any access constraints in the quote notes. The manufacturer should confirm build dimensions, tolerances, access, installation and price before an order is agreed.",
      },
    ],
  },
  {
    slug: "compare-furniture-quotes",
    title: "Compare furniture materials and quotations",
    description:
      "Questions about construction, finish, upholstery and scope that help you compare custom furniture quotations fairly.",
    sections: [
      {
        title: "Ask what each part is made from",
        text: "A material name alone may not describe an entire item. Ask which parts use solid wood, veneer, engineered board or metal, and what supports joints, shelves and moving components. Suitability depends on construction, environment and intended use; no material is automatically best for every room.",
      },
      {
        title: "Review a finish or upholstery sample",
        text: "Screen colors change with lighting and display settings. Ask for an approved physical sample where possible, cleaning instructions and any relevant limitations. For upholstery, discuss feel, removable covers and everyday wear. A concept image is an idea, not a finish sample or proof of manufactured quality.",
      },
      {
        title: "Compare the same scope",
        text: "List dimensions, materials, hardware, finish and any upholstery in each request. Ask whether tax, transport, access handling and installation are included. Confirm any proposed schedule and warranty directly; this site does not promise them or assume they apply.",
      },
      {
        title: "Keep the final agreement clear",
        text: "Review the final specification and price with the owner after manufacturer feasibility checks. Note accepted changes and care requirements. Submitting the website form starts a conversation; it does not accept an order or collect payment.",
      },
    ],
  },
];
export const guideURL = (g: { slug: string }) => `/guides/${g.slug}`;
export function categoryContent(c: { id: string; name: string }) {
  const content: Record<string, { intro: string; checks: string[] }> = {
    sofas: {
      intro:
        "Choose seating around how you relax, the room's circulation and the number of people who use it. These sofa concepts are a starting point for a specification discussion.",
      checks: [
        "Compare overall width with usable seat depth and back height.",
        "Check doorway access and whether sections can be delivered separately.",
        "Discuss upholstery samples, cushion support and cleaning requirements.",
      ],
    },
    beds: {
      intro:
        "Start with your mattress and the space around it. A bed's frame footprint can be larger than the mattress size, especially with upholstered sides or a headboard.",
      checks: [
        "Share the mattress dimensions and desired finished sleeping height.",
        "Allow clearance for bedside use, storage drawers and wardrobe doors.",
        "Confirm slat/support construction and assembly access with the manufacturer.",
      ],
    },
    dining: {
      intro:
        "Plan a dining area for seated people and movement, not just the tabletop. Round and rectangular layouts use space differently; compare their footprints in your room.",
      checks: [
        "Measure with chairs pulled out as well as tucked under the table.",
        "Check leg placement against seating positions and chair arms.",
        "Discuss surface care, spills and the finish sample before deciding.",
      ],
    },
    wardrobes: {
      intro:
        "A wardrobe request should describe what you store and how you reach it. Room height alone does not determine usable storage or installation clearance.",
      checks: [
        "List hanging, folded and drawer storage needs.",
        "Compare hinged-door clearance with sliding access and track space.",
        "Ask about wall fixing, uneven floors, skirting and assembly clearance.",
      ],
    },
    custom: {
      intro:
        "Turn an unusual space or a particular need into a clear furniture brief. Start with constraints and intended use before deciding on a shape or finish.",
      checks: [
        "Sketch the usable space, obstructions and access route in centimetres.",
        "Explain intended use, storage needs and preferred materials.",
        "Ask the owner to confirm feasibility and the final specification before ordering.",
      ],
    },
  };
  return (
    content[c.id] || {
      intro: `Explore ${c.name.toLowerCase()} ideas and prepare a clear request for your space. Final dimensions, construction and delivery feasibility require review.`,
      checks: [
        "Measure the available space and access route.",
        "Compare material and finish samples with the intended use.",
        "Review the final specification and quotation before confirming an order.",
      ],
    }
  );
}
