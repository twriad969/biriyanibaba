# Biriyani Hunter (Biriyani Zone) 🍛📍

**Biriyani Hunter** is a community-driven mobile-first web application designed to help people in Bangladesh (specifically Dhaka) find and share locations where free food or aid is being distributed. The app aims to connect those in need with generous donors and community efforts through real-time mapping and crowd-sourced data.

## ✨ Key Features

- **📍 Real-time Map Interface**: Visualize food distribution points using an interactive map powered by Leaflet and OpenStreetMap.
- **🕌 Mosque Detector**: Automatically detects nearby mosques using the Overpass API, allowing users to easily add them as food distribution spots.
- **🗳️ Community Moderation**: A robust voting system to ensure data accuracy.
  - **10+ Downvotes**: Listing is automatically blurred as potential spam.
  - **20+ Downvotes**: Listing is automatically deleted to maintain quality.
- **⏳ Smart Expiry**: Users can set an expiry date for their listings. Listings automatically disappear after they are no longer valid (default: 1 day).
- **📱 Mobile-First Design**: Built with a premium, responsive UI featuring both Dark and Light modes.
- **👤 Contact Info**: View and share contact details for each spot to facilitate direct communication.
- **📅 Date Filtering**: Easily switch between today's and yesterday's updates.
- **💾 Offline Capabilities**: Built using Capacitor for potential mobile deployment and local database management.

## 🛠️ Tech Stack

- **Frontend**: React, Vite, Tailwind CSS, Framer Motion
- **Icons**: Lucide-React
- **Maps**: React-Leaflet, Leaflet.js
- **Native/Mobile**: Capacitor (Geolocation, Share API)
- **Database**: Local storage and structured DB integration for persistent data.
- **APIs**: OpenStreetMap (Nominatim), Overpass API (Mosque detection).

## 🚀 Getting Started

### Prerequisites

- Node.js (Latest LTS recommended)
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/ronoksheik/biriyani-dibe.git
   cd "biriyani dibe"
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Open your browser and navigate to `http://localhost:5173`.

## 📱 Mobile Build (APK)

This project is configured with GitHub Actions to automatically build Android APKs. Check the `.github/workflows/build-apk.yml` for more details.

---

Made with ❤️ for the community. #BiriyaniZone #BZone #CommunityPower #DhakaHelper
