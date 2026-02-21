🗺️ Biryani Zone App — Full Upgrade Plan

This plan details the implementation of a modern, dark-themed, mobile-first UI for the Biriyani Zone app, fulfilling the requested specifications.

1. Database Schema Update (src/db.js)

We will add new columns to the locations table to support the new features:





category (TEXT)



expiry_date (TEXT)



contact_name (TEXT)



contact_number (TEXT)

Code Snippet (src/db.js):

await db.execute(`
  ALTER TABLE locations ADD COLUMN category TEXT DEFAULT '🍛';
`);
// ... repeat for other new columns, handling potential "column exists" errors gracefully

2. Dependencies & UI Framework





Install shadcn/ui components (Drawer, Dialog, Form, Input, Select, Skeleton) to build the polished mobile UI.



Install leaflet.heat for the Hot Zones heatmap feature.



Update fonts in index.html / index.css: Noto Sans Bengali, JetBrains Mono, Syne.

3. UI/UX Overhaul (Dark Theme & Mobile-First) (src/index.css, src/App.jsx)





Implement the dark theme (#0a0a0f) across all components.



Apply the requested font families to specific elements.



Add a horizontal scrollable category filter pill bar below the header.



Apply CSS filters to desaturate and darken map tiles.

4. Map Behavior & Categories (src/App.jsx)





Initial State: Load map empty. Fetch pins only when the "Listing Panel" is opened or specific actions are taken.



Categories: Define categories with unique emojis, labels, and colors.



Map Pins: Create custom Leaflet DivIcons for each category using the defined colors and emojis.

5. Hot Zones (Heatmap) (src/App.jsx)





Integrate leaflet.heat or a custom component to render heatmaps based on the density of mosques and food spots.



Add a "🔥 Hot Zones" toggle button to the header.

6. Slide-in Listing Panel (src/App.jsx)





Use a shadcn/ui Drawer or a custom Framer Motion component for the side/bottom panel.



Implement lazy loading: Show skeletons (Loader2 or Skeleton component) while fetching data.



Render listing cards with category emoji, vote color indicators (green/red), vote score, comment count, and expiry badge.



Clicking a card flies the map to the location and opens the full detail modal.

7. Map Pin Mini Popup & Full Detail Modal (src/App.jsx)





Mini Popup: Replace standard Leaflet tooltips with a custom popup showing basic info and a "বিস্তারিত দেখুন →" button.



Full Detail Modal: Use a shadcn/ui Dialog or Drawer for the full view. Include upvote/downvote buttons, all details, expiry status, and the comments section.

8. Floating Action Button (FAB) & Add Listing Form (src/App.jsx)





FAB: Create a fixed bottom-right button that rotates 45deg and reveals a stacked menu of categories.



Form Modal: Open a detailed form when a category is selected from the FAB.



Form Fields: Category selector, Name, Description (optional), Location (Lat/Lng with map-pick feature), Expiry Date, Contact Name, Contact Number (optional).

9. Voting, Comments, & Expiry Logic (src/App.jsx)





Ensure upvote/downvote actions update the UI dynamically (green for net positive, red for net negative).



Implement the comment submission and display logic within the Full Detail Modal.



Add a filtering mechanism to exclude listings whose expiry_date has passed.

