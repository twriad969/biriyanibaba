# Biriyani Hunter
### Community-Driven Aid Distribution Mapping

**Biriyani Hunter** (Biriyani Zone) is a high-performance, mobile-first platform engineered to coordinate community aid across Bangladesh. By leveraging real-time geospatial data, it connects donors with those in need, streamlining the distribution of food and essential resources through a verified, crowd-sourced intelligence layer.

---

## Core Infrastructure

### 📍 Real-time Geospatial Intelligence
Interactive mapping interface built on Leaflet and OpenStreetMap, providing sub-meter precision for distribution points.

### 🕌 Automated Landmark Detection
Integrated Mosque Detector utilizing the Overpass API to autonomously identify and suggest potential distribution hubs within a user's vicinity.

### 🗳️ Decentralized Moderation
A self-regulating ecosystem powered by community consensus:
- **Spam Mitigation**: Listings with 10+ downvotes are automatically obfuscated.
- **Auto-Purge**: Listings with 20+ downvotes are permanently excised from the database.

### ⏳ Temporal Dynamics
Intelligent listing lifecycle management. Resources are programmed with custom expiry parameters, defaulting to a 24-hour cycle to ensure information freshness and relevance.

### 📱 Adaptive Architecture
Premium, responsive UI architecture featuring high-contrast Dark and Light modes, optimized for field use on mobile devices via Capacitor.

---

## Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React, Vite, Framer Motion |
| **Styling** | Tailwind CSS |
| **Geospatial** | Leaflet, React-Leaflet, Overpass API |
| **Mobile Bridge** | Capacitor (Geolocation, Share API) |
| **Persistence** | Structured Local DB, LocalStorage |

---

## Deployment & Development

### Infrastructure Setup

1. **Clone & Initialize**
   ```bash
   git clone https://github.com/ronoksheik/biriyani-dibe.git
   cd "biriyani dibe"
   ```

2. **Dependency Management**
   ```bash
   npm install
   ```

3. **Runtime**
   ```bash
   npm run dev
   ```

### Mobile Distribution
Automated Android builds are handled via integrated GitHub Actions. Refer to `.github/workflows/build-apk.yml` for CI/CD specifications.

---

Built for the community. Developed for impact.
`#BiriyaniZone` `#BZone` `#CommunityPower` `#DhakaHelper`
