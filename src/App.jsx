import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents, Circle, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Geolocation } from '@capacitor/geolocation';
import { Share } from '@capacitor/share';
import { db, initDb } from './db';
import { 
  Map as MapIcon, Search, Plus, Bookmark, User, 
  MapPin, Clock, MessageSquare, Send, 
  X, Info, CheckCircle, XCircle, 
  Navigation, Share2, Award, Moon, Sun,
  Smartphone, ArrowRight, List as ListIcon, Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CATEGORIES, TAG_OPTIONS, 
  WALKING_SPEED, DRIVING_SPEED, DHAKA_COORDS,
  toBengaliNumber 
} from './constants';

// --- Utilities ---
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const formatDistanceBN = (dist) => {
  if (dist === null || isNaN(dist)) return "দূরত্ব অজানা";
  if (dist < 1) return `${toBengaliNumber((dist * 1000).toFixed(0))} মিটার`;
  return `${toBengaliNumber(dist.toFixed(1))} কিমি`;
};

const calculateTravelTime = (dist, speed) => {
  if (dist === null || isNaN(dist)) return null;
  const hours = dist / speed;
  const minutes = Math.round(hours * 60);
  return minutes;
};

// --- Custom Icons ---
const getMarkerIcon = (category, upvotes, downvotes, isSelected) => {
  const cat = CATEGORIES.find(c => c.emoji === category) || CATEGORIES[0];
  const isFake = (downvotes - upvotes >= 5);
  const color = isFake ? '#ef4444' : cat.color;
  
  return L.divIcon({
    html: `<div class="marker-pin-custom ${isSelected ? 'selected' : ''}" style="--pin-color: ${color}">
      <div class="pin-inner">${category || '🍛'}</div>
    </div>`,
    className: '',
    iconSize: [40, 48],
    iconAnchor: [20, 48]
  });
};

const userIcon = L.divIcon({
  html: `<div class="user-pulse"></div>`,
  className: '',
  iconSize: [20, 20],
  iconAnchor: [10, 10]
});

// --- Components ---

const MosqueDetector = ({ onMosquesFound }) => {
  const map = useMap();
  const lastCenter = useRef(null);

  const fetchMosques = useCallback(async () => {
    const center = map.getCenter();
    if (lastCenter.current && center.distanceTo(lastCenter.current) < 500) return;
    lastCenter.current = center;

    const bounds = map.getBounds();
    const query = `
      [out:json][timeout:25];
      (
        node["amenity"="place_of_worship"]["religion"="muslim"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
      );
      out body center;
    `;
    try {
      const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
      const data = await response.json();
      const mosques = data.elements.map(el => ({
        id: `mosque-${el.id}`,
        lat: el.lat || el.center.lat,
        lng: el.lon || el.center.lon,
        name: el.tags.name || el.tags['name:bn'] || "মসজিদ",
        category: '🕌',
        isManual: false,
        upvotes: 0,
        downvotes: 0,
        area: el.tags['addr:suburb'] || el.tags['addr:street'] || "এলাকা"
      }));
      onMosquesFound(mosques);
    } catch (e) {
      console.error("Overpass error:", e);
    }
  }, [map, onMosquesFound]);

  useMapEvents({ moveend: fetchMosques });
  useEffect(() => { fetchMosques(); }, []);
  return null;
};

const MapController = ({ center, zoom, flyTo }) => {
  const map = useMap();
  useEffect(() => {
    if (flyTo && center) {
      map.flyTo(center, zoom || 18, { duration: 1.5 });
    } else if (center) {
      map.setView(center, zoom || map.getZoom());
    }
  }, [center, zoom, flyTo, map]);
  return null;
};

const HeatLayer = ({ points }) => {
  const map = useMap();
  const heatLayerRef = useRef(null);

  useEffect(() => {
    if (!map || !points.length) return;
    
    if (heatLayerRef.current) {
      map.removeLayer(heatLayerRef.current);
    }

    const heatData = points.map(p => [p.lat, p.lng, 0.5]);
    heatLayerRef.current = L.heatLayer(heatData, {
      radius: 25,
      blur: 15,
      maxZoom: 17,
      gradient: { 0.4: 'blue', 0.65: 'lime', 1: 'red' }
    }).addTo(map);

    return () => {
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current);
      }
    };
  }, [map, points]);

  return null;
};

const ListingCard = memo(({ loc, userLocation, isSaved, onToggleSave, onSelect, isDarkMode }) => {
  const distance = useMemo(() => {
    if (!userLocation) return null;
    return calculateDistance(userLocation.lat, userLocation.lng, loc.lat, loc.lng);
  }, [userLocation, loc.lat, loc.lng]);

  const walkTime = useMemo(() => distance ? Math.round((distance / WALKING_SPEED) * 60) : null, [distance]);
  
  const sentimentColor = loc.downvotes > loc.upvotes ? 'border-rose-500' : (loc.upvotes > 0 ? 'border-emerald-500' : 'border-transparent');

  return (
    <motion.div 
      whileTap={{ scale: 0.97 }}
      onClick={() => onSelect(loc)}
      className={`${isDarkMode ? 'bg-[#1a1a27] border-white/5' : 'bg-white border-slate-100 shadow-sm'} border p-5 rounded-[28px] flex gap-4 items-center transition-all mb-4 relative overflow-hidden`}
    >
      <div className={`w-14 h-14 ${isDarkMode ? 'bg-white/5' : 'bg-slate-50'} rounded-2xl flex items-center justify-center text-3xl shrink-0`}>
        {loc.category || '🍛'}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-black text-base truncate mb-1">{loc.name}</h3>
        <div className="flex items-center gap-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          <div className="flex items-center gap-1"><MapPin size={12} className="text-orange-400" /> {formatDistanceBN(distance)}</div>
          <div className="flex items-center gap-1">🚶 {walkTime ? toBengaliNumber(walkTime) : '?'} মি:</div>
        </div>
      </div>
      <button 
        onClick={(e) => { e.stopPropagation(); onToggleSave(loc.id); }}
        className={`p-3 rounded-xl transition-all ${isSaved ? 'bg-orange-400/10 text-orange-400' : 'text-slate-400 active:bg-slate-100'}`}
      >
        <Bookmark size={20} fill={isSaved ? "currentColor" : "none"} />
      </button>
      
      {loc.downvotes >= 10 && (
        <div className="absolute inset-0 bg-rose-500/5 backdrop-blur-[1px] pointer-events-none" />
      )}
    </motion.div>
  );
});

// --- Main App ---

const App = () => {
  // --- States ---
  const [activeTab, setActiveTab] = useState('map');
  const [showSplash, setShowSplash] = useState(!sessionStorage.getItem('splash_shown'));
  
  const [username, setUsername] = useState(() => {
    const saved = localStorage.getItem('bzone_username');
    if (saved) return saved;
    const newName = `Hunter-${Math.random().toString(36).substr(2, 4)}`;
    localStorage.setItem('bzone_username', newName);
    return newName;
  });
  
  const [userLocation, setUserLocation] = useState(null);
  const [mapCenter, setMapCenter] = useState(DHAKA_COORDS);
  const [mapZoom, setMapZoom] = useState(15);
  const [flyTo, setFlyTo] = useState(false);
  
  // Track if we should auto-follow user location (only once on first load or when "Auto" clicked)
  const [shouldFollowUser, setShouldFollowUser] = useState(false);
  
  const [locations, setLocations] = useState([]);
  const [detectedMosques, setDetectedMosques] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLocation, setSelectedLocation] = useState(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [savedIds, setSavedIds] = useState(() => JSON.parse(localStorage.getItem('userBookmarks') || '[]'));
  const [addedIds, setAddedIds] = useState(() => JSON.parse(localStorage.getItem('userAddedListings') || '[]'));
  const [voteCounts, setVoteCounts] = useState(() => JSON.parse(localStorage.getItem('userVotes') || '{}'));
  
  const [showAddForm, setShowAddForm] = useState(false);
  const [addFlowStep, setAddFlowStep] = useState('location');
  const [newLocation, setNewLocation] = useState({ 
    name: '', 
    category: '🍛', 
    notes: '', 
    packets: '', 
    contact_name: '', 
    contact_number: '',
    expiry_date: new Date().toISOString().split('T')[0] // Default to today
  });
  
  const [toast, setToast] = useState(null);
  const [sheetSnap, setSheetSnap] = useState(0.25);
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('theme') !== 'light');
  const [newComment, setNewComment] = useState('');

  // Auto-close sheet when adding a spot to make map visible
  useEffect(() => {
    if (showAddForm && addFlowStep === 'location') {
      setSheetSnap(0);
    } else if (!showAddForm && activeTab === 'map') {
      setSheetSnap(0.25);
    }
  }, [showAddForm, addFlowStep, activeTab]);

  const handleGeocodeSearch = async (e) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}+bangladesh&format=json&limit=1`);
        const data = await res.json();
        if (data && data.length > 0) {
          setMapCenter([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
          setFlyTo(true);
          setActiveTab('map');
          showToast(`📍 ${data[0].display_name.split(',')[0]} এ যাওয়া হচ্ছে`);
        } else {
          showToast("লোকেশন পাওয়া যায়নি");
        }
      } catch (e) {
        showToast("সার্চ ব্যর্থ হয়েছে");
      }
    }
  };

  // --- Derived State ---
  const allSpots = useMemo(() => {
    // Only use manually verified spots from the database
    // Automatically added mosques from Overpass API are NOT marked as having free food
    // until a user manually adds them via the "Add Spot" flow.
    return locations;
  }, [locations]);

  // Detected mosques should be shown differently (maybe grayed out or a plus icon) 
  // to indicate they CAN be added as food spots.
const MosquePlusIcon = L.divIcon({
    html: `<div class="mosque-suggest-pin">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
    </div>`,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });

  const filteredLocations = useMemo(() => {
    let list = allSpots;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(l => 
        l.name.toLowerCase().includes(q) || 
        (l.area && l.area.toLowerCase().includes(q)) ||
        l.category.includes(q)
      );
    }
    return list;
  }, [searchQuery, allSpots]);

  // --- Effects ---
  useEffect(() => {
    if (showSplash) {
      sessionStorage.setItem('splash_shown', 'true');
      setTimeout(() => setShowSplash(false), 2000);
    }
    initDb().then(fetchLocations);
    
    // Sync vote counts from DB to LocalStorage on load
    const syncVotes = async () => {
      const savedUserId = localStorage.getItem('bzone_user_id');
      const userId = savedUserId || `u-${Math.random().toString(36).substr(2, 9)}`;
      if (!savedUserId) localStorage.setItem('bzone_user_id', userId);

      try {
        const result = await db.execute({
          sql: "SELECT location_id, vote_type FROM votes WHERE user_id = ?",
          args: [userId]
        });
        const votes = {};
        result.rows.forEach(r => votes[r.location_id] = r.vote_type);
        setVoteCounts(votes);
      } catch (e) { console.error(e); }
    };
    syncVotes();
    
    // Geolocation
    const fetchUserLocation = async () => {
      try {
        const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
        if (!sessionStorage.getItem('initial_center_set')) {
          setMapCenter([loc.lat, loc.lng]);
          sessionStorage.setItem('initial_center_set', 'true');
        }
      } catch (e) {
        console.error("Capacitor Geolocation Error:", e);
      }
    };
    fetchUserLocation();
  }, []);

  // Center on most listed area on first load
  useEffect(() => {
    if (locations.length > 0 && !sessionStorage.getItem('initial_center_set')) {
      // Group locations by area or just find the highest density
      // Simple logic: find area with most occurrences
      const areaCounts = {};
      locations.forEach(loc => {
        const area = loc.area || 'Unknown';
        areaCounts[area] = (areaCounts[area] || 0) + 1;
      });

      let mostListedArea = null;
      let maxCount = 0;
      for (const area in areaCounts) {
        if (areaCounts[area] > maxCount) {
          maxCount = areaCounts[area];
          mostListedArea = area;
        }
      }

      if (mostListedArea) {
        const firstInArea = locations.find(l => l.area === mostListedArea);
        if (firstInArea) {
          setMapCenter([firstInArea.lat, firstInArea.lng]);
          setFlyTo(true);
          sessionStorage.setItem('initial_center_set', 'true');
        }
      }
    }
  }, [locations]);

  useEffect(() => {
    localStorage.setItem('userBookmarks', JSON.stringify(savedIds));
    localStorage.setItem('userVotes', JSON.stringify(voteCounts));
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [savedIds, voteCounts, isDarkMode]);

  // --- Functions ---
  const fetchLocations = useCallback(async () => {
    setIsLoading(true);
    try {
      // Logic: Show spots that were created on or before the selected date, 
      // AND are set to expire on or after the selected date.
      const result = await db.execute({
        sql: "SELECT * FROM locations WHERE date <= ? AND (expiry_date >= ? OR expiry_date = '' OR expiry_date IS NULL) ORDER BY created_at DESC",
        args: [selectedDate, selectedDate]
      });
      setLocations(result.rows);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const handleToggleSave = useCallback((id) => {
    setSavedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    showToast("সেভ করা হয়েছে");
  }, [showToast]);

  const handleSelectSpotFromList = (loc) => {
    setMapCenter([loc.lat, loc.lng]);
    setFlyTo(true);
    setActiveTab('map');
    setSheetSnap(0.25);
    // User wants location first, so we don't set selectedLocation immediately
    // selectedLocation triggers the bottom detail sheet.
    // If we want it completely closed, we just leave it.
    setSelectedLocation(null); 
  };

  const handleVote = async (id, type) => {
    if (String(id).startsWith('mosque-')) {
      showToast("এই স্পটে ভোট দেওয়া যাবে না");
      return;
    }

    const currentVote = voteCounts[id];
    const userId = localStorage.getItem('bzone_user_id') || `u-${Math.random().toString(36).substr(2, 9)}`;
    if (!localStorage.getItem('bzone_user_id')) localStorage.setItem('bzone_user_id', userId);

    try {
      if (currentVote === type) {
        // Remove vote
        await db.batch([
          { sql: `UPDATE locations SET ${type === 'up' ? 'upvotes' : 'downvotes'} = MAX(0, ${type === 'up' ? 'upvotes' : 'downvotes'} - 1) WHERE id = ?`, args: [id] },
          { sql: `DELETE FROM votes WHERE location_id = ? AND user_id = ?`, args: [id, userId] }
        ]);
        setVoteCounts(prev => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        showToast("ভোট তুলে নেওয়া হয়েছে");
      } else if (currentVote) {
        // Change vote
        const oldField = currentVote === 'up' ? 'upvotes' : 'downvotes';
        const newField = type === 'up' ? 'upvotes' : 'downvotes';
        await db.batch([
          { sql: `UPDATE locations SET ${oldField} = MAX(0, ${oldField} - 1), ${newField} = ${newField} + 1 WHERE id = ?`, args: [id] },
          { sql: `UPDATE votes SET vote_type = ? WHERE location_id = ? AND user_id = ?`, args: [type, id, userId] }
        ]);
        setVoteCounts(prev => ({ ...prev, [id]: type }));
        showToast("ভোট পরিবর্তন করা হয়েছে");
      } else {
        // New vote
        await db.batch([
          { sql: `UPDATE locations SET ${type === 'up' ? 'upvotes' : 'downvotes'} = ${type === 'up' ? 'upvotes' : 'downvotes'} + 1 WHERE id = ?`, args: [id] },
          { sql: `INSERT INTO votes (id, location_id, user_id, vote_type) VALUES (?, ?, ?, ?)`, args: [Math.random().toString(36).substr(2, 9), id, userId, type] }
        ]);
        setVoteCounts(prev => ({ ...prev, [id]: type }));
        showToast("ভোট সফল");
      }
      fetchLocations();
    } catch (e) {
      console.error("Vote Error:", e);
      showToast("ভোট দিতে সমস্যা হয়েছে");
    }
  };

  const handleAddSubmit = async () => {
    if (!newLocation.name.trim()) return showToast("নাম দিন!");
    try {
      const id = Math.random().toString(36).substr(2, 9);
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${mapCenter[0]}&lon=${mapCenter[1]}&format=json`);
      const data = await res.json();
      const area = data?.address?.suburb || data?.address?.city || data?.address?.town || "ঢাকা";

      await db.execute({
        sql: `INSERT INTO locations (id, name, area, time, lat, lng, date, category, expiry_date, notes, packets, contact_name, contact_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          id, newLocation.name, area, new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 
          mapCenter[0], mapCenter[1], today, newLocation.category, newLocation.expiry_date || today, newLocation.notes, 
          parseInt(newLocation.packets) || 0,
          newLocation.contact_name || username,
          newLocation.contact_number || ''
        ]
      });

      setAddedIds(prev => [...prev, id]);
      setShowAddForm(false);
      setAddFlowStep('location');
      fetchLocations();
      showToast("সফলভাবে যোগ করা হয়েছে");
    } catch (e) {
      showToast("ব্যর্থ হয়েছে");
    }
  };

  const handleShare = async (loc) => {
    const text = `${loc.name} (${loc.area || 'এলাকা'}) - Biriyani Hunter-এ দেখুন!`;
    const url = `https://maps.google.com/?q=${loc.lat},${loc.lng}`;
    try {
      await Share.share({ title: 'Biriyani Hunter Spot', text, url });
    } catch (e) {
      navigator.clipboard.writeText(`${text} ${url}`);
      showToast("📋 লিঙ্ক কপি করা হয়েছে");
    }
  };

  // --- Map Events ---
  const MapEvents = () => {
    useMapEvents({
      click: (e) => {
        if (showAddForm && addFlowStep === 'location') {
          setMapCenter([e.latlng.lat, e.latlng.lng]);
          setFlyTo(true);
        } else if (sheetSnap > 0.3) {
          setSheetSnap(0.25);
        }
      },
      dragend: (e) => {
        if (showAddForm && addFlowStep === 'location') {
          const center = e.target.getCenter();
          setMapCenter([center.lat, center.lng]);
          setFlyTo(false); // Disable flyTo during manual drag
        }
      },
      moveend: (e) => {
        if (showAddForm && addFlowStep === 'location') {
          const center = e.target.getCenter();
          setMapCenter([center.lat, center.lng]);
          setFlyTo(false); // Disable flyTo after map stops moving
        }
      }
    });
    return null;
  };

  if (showSplash) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0f] z-[9999] flex flex-col items-center justify-center">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <div className="text-8xl mb-4">🍛</div>
          <h1 className="text-3xl font-black text-orange-400 font-syne text-center tracking-tighter">Biriyani Hunter</h1>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={`h-screen w-full overflow-hidden relative font-bengali ${isDarkMode ? 'bg-[#0a0a0f] text-slate-100' : 'bg-[#f8fafc] text-slate-900'}`}>
      
      {/* Floating Top Search Bar */}
      <div className="fixed top-0 inset-x-0 z-[2500] p-4 pointer-events-none">
        <div className="max-w-md mx-auto flex gap-2 pointer-events-auto">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input 
              placeholder="খাবার বা এলাকা খুঁজুন..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={handleGeocodeSearch}
              className={`w-full ${isDarkMode ? 'bg-[#12121a]/90 border-white/10' : 'bg-white/90 border-slate-200'} backdrop-blur-xl border rounded-2xl py-3.5 pl-11 pr-4 font-bold outline-none focus:border-orange-400/50 shadow-2xl transition-all`}
            />
          </div>
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)} 
            className={`p-3.5 ${isDarkMode ? 'bg-[#12121a]/90 border-white/10' : 'bg-white/90 border-slate-200'} backdrop-blur-xl border rounded-2xl text-orange-400 shadow-2xl transition-all active:scale-95`}
          >
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} className="fixed bottom-24 inset-x-0 z-[6000] flex justify-center px-6 pointer-events-none">
            <div className={`px-5 py-2.5 rounded-full shadow-2xl flex items-center gap-2 text-xs font-bold pointer-events-auto ${isDarkMode ? 'bg-[#1a1a27] border-white/10 text-white' : 'bg-white border-slate-100 text-slate-900'}`}>
              <Info size={14} className="text-orange-400" /> {toast}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="h-full w-full pb-[80px]">
        {activeTab === 'map' && (
          <div className="h-full w-full relative">
            <div className="fixed top-20 inset-x-0 z-[2500] flex justify-center px-4 pointer-events-none">
              <div className={`p-1 rounded-2xl backdrop-blur-xl border flex gap-1 pointer-events-auto shadow-xl ${isDarkMode ? 'bg-[#12121a]/80 border-white/10' : 'bg-white/80 border-slate-200'}`}>
                {[-1, 0].map(offset => {
                  const date = new Date();
                  date.setDate(date.getDate() + offset);
                  const dateStr = date.toISOString().split('T')[0];
                  const isActive = selectedDate === dateStr;
                  return (
                    <button 
                      key={dateStr}
                      onClick={() => { setSelectedDate(dateStr); }}
                      className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${isActive ? 'bg-orange-400 text-black shadow-lg' : 'text-slate-500 hover:bg-white/5'}`}
                    >
                      {offset === -1 ? 'Yesterday' : 'Today'}
                    </button>
                  );
                })}
              </div>
            </div>

            <MapContainer center={mapCenter} zoom={mapZoom} zoomControl={false} className="h-full w-full dark-map">
              <TileLayer url={isDarkMode ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"} />
              <MapController center={mapCenter} zoom={mapZoom} flyTo={flyTo} />
              <MapEvents />
              <MosqueDetector onMosquesFound={setDetectedMosques} />
              
      {filteredLocations.map(loc => {
        const isSpam = (loc.downvotes >= 10);
        const shouldDelete = (loc.downvotes >= 20);
        if (shouldDelete) return null;

        return (
          <Marker 
            key={loc.id} 
            position={[loc.lat, loc.lng]} 
            icon={getMarkerIcon(loc.category, loc.upvotes || 0, loc.downvotes || 0, selectedLocation?.id === loc.id)}
            eventHandlers={{ 
              click: (e) => { 
                setMapCenter([loc.lat, loc.lng]);
                setFlyTo(true);
              } 
            }}
          >
            <Popup closeButton={false} offset={[0, -40]}>
              <div className={`popup-container ${isSpam ? 'blur-sm grayscale opacity-50' : ''}`}>
                {isSpam && <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 text-[10px] font-black text-white uppercase tracking-tighter">স্প্যাম হিসেবে চিহ্নিত</div>}
                <div className="popup-header">
                  <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest opacity-80">
                    <MapPin size={10} /> {loc.area || 'এলাকা'}
                  </div>
                  <h3 className="text-sm font-black leading-tight mt-0.5">{loc.name}</h3>
                </div>
                <div className="popup-body">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-4">
                    <div className="flex items-center gap-1.5">
                      <span className="text-lg">{loc.category}</span>
                      <span className="text-slate-900 font-black">ফ্রি খাবার</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={(e) => { e.stopPropagation(); handleVote(loc.id, 'up'); }} className="vote-btn-green">
                      <CheckCircle size={14} /> {toBengaliNumber(loc.upvotes || 0)} সত্যি
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleVote(loc.id, 'down'); }} className="vote-btn-red">
                      <XCircle size={14} /> {toBengaliNumber(loc.downvotes || 0)} ভুয়া
                    </button>
                  </div>
                </div>
                <button 
                  onClick={(e) => { 
                    e.stopPropagation();
                    setSelectedLocation(loc); 
                    setSheetSnap(0.92); 
                  }}
                  className="w-full bg-slate-50 py-3 text-[10px] font-black uppercase text-slate-400 border-t border-slate-100 active:bg-slate-100 transition-colors"
                >
                  বিস্তারিত দেখুন →
                </button>
              </div>
            </Popup>
          </Marker>
        );
      })}
              
              {userLocation && <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon} />}
              
              {showAddForm && addFlowStep === 'location' && (
                <Marker 
                  position={mapCenter} 
                  icon={L.divIcon({
                    html: `<div class="marker-pin-custom selected" style="--pin-color: #f97316; filter: drop-shadow(0 0 10px rgba(249,115,22,0.5))">
                      <div class="pin-inner">📍</div>
                    </div>`,
                    className: '',
                    iconSize: [40, 48],
                    iconAnchor: [20, 48]
                  })}
                />
              )}
              
              {/* Show suggested mosques that AREN'T in our food database yet */}
              {detectedMosques.map(mosque => {
                const alreadyAdded = locations.some(l => 
                  Math.abs(l.lat - mosque.lat) < 0.0001 && 
                  Math.abs(l.lng - mosque.lng) < 0.0001
                );
                if (alreadyAdded) return null;

                return (
                  <Marker 
                    key={mosque.id} 
                    position={[mosque.lat, mosque.lng]} 
                    icon={MosquePlusIcon}
                    eventHandlers={{
                      click: () => {
                        setMapCenter([mosque.lat, mosque.lng]);
                        setFlyTo(true);
                        setNewLocation({ ...newLocation, name: mosque.name, category: '🕌' });
                        setShowAddForm(true);
                        setAddFlowStep('details'); // Skip location since we have it
                        showToast(`🕌 ${mosque.name} এ খাবার যোগ করুন`);
                      }
                    }}
                  />
                );
              })}
              
              {showAddForm && addFlowStep === 'location' && (
                <div className="fixed inset-0 pointer-events-none flex items-center justify-center z-[1000]">
                  <div className="relative flex flex-col items-center">
                    <div className="text-5xl mb-2 filter drop-shadow(0 0 10px rgba(0,0,0,0.5))">📍</div>
                  </div>
                </div>
              )}
      {/* Add Spot Confirm Button (Floating on Map) */}
      <AnimatePresence>
        {showAddForm && addFlowStep === 'location' && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed inset-x-0 bottom-0 z-[6000] flex flex-col items-center gap-3 px-6 pb-10 pt-8 pointer-events-none bg-gradient-to-t from-black/80 via-black/40 to-transparent"
          >
            <div className="flex flex-col gap-3 p-2 bg-black/90 backdrop-blur-2xl rounded-[32px] border border-white/20 pointer-events-auto shadow-2xl w-full max-w-[400px]">
              <div className="flex gap-2">
                <button 
                  onClick={(e) => { 
                    e.stopPropagation();
                    if(userLocation) { 
                      setMapCenter([userLocation.lat, userLocation.lng]); 
                      setFlyTo(true); 
                      setMapZoom(18);
                    } else {
                      showToast("লোকেশন পারমিশন চেক করুন");
                    }
                  }}
                  className={`flex-1 py-4 rounded-[20px] text-[10px] font-black uppercase flex flex-col items-center justify-center gap-1 transition-all active:scale-95 ${userLocation ? 'text-white bg-white/10 border border-white/10' : 'text-white/30 bg-white/5 border border-white/5'}`}
                >
                  <Smartphone size={18} /> অটো (GPS)
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); setFlyTo(false); }}
                  className="flex-1 py-4 rounded-[20px] text-[10px] font-black uppercase flex flex-col items-center justify-center gap-1 text-orange-400 bg-orange-400/10 border border-orange-400/20"
                >
                  <MapIcon size={18} /> ম্যানুয়াল (ম্যাপ)
                </button>
              </div>

              <button 
                onClick={(e) => { e.stopPropagation(); setAddFlowStep('details'); }}
                className="w-full bg-orange-400 text-black py-5 rounded-[24px] font-black text-base shadow-2xl shadow-orange-400/40 pointer-events-auto flex items-center justify-center gap-3 active:scale-95 transition-transform border-4 border-white/20"
              >
                এই লোকেশন ব্যবহার করুন <ArrowRight size={20} />
              </button>
            </div>
            
            <button 
              onClick={(e) => { e.stopPropagation(); setShowAddForm(false); setAddFlowStep('location'); }}
              className="px-8 py-2.5 bg-black/60 backdrop-blur-md text-white/60 rounded-full text-[10px] font-black uppercase tracking-widest pointer-events-auto border border-white/10"
            >
              বাতিল করুন
            </button>
          </motion.div>
        )}
      </AnimatePresence>
            </MapContainer>

            <div 
              className="fixed right-6 z-[2500] flex flex-col gap-3 transition-all duration-300"
              style={{ bottom: `calc(${sheetSnap * 100}% + 24px)` }}
            >
              <button 
                onClick={() => {
                  if (userLocation) {
                    setMapCenter([userLocation.lat, userLocation.lng]);
                    setFlyTo(true);
                    setMapZoom(18);
                    showToast("আপনার লোকেশনে যাওয়া হচ্ছে");
                  } else {
                    showToast("GPS লোকেশন পাওয়া যাচ্ছে না");
                  }
                }}
                className={`p-4 rounded-2xl shadow-2xl backdrop-blur-xl border transition-all active:scale-90 ${isDarkMode ? 'bg-[#12121a]/90 border-white/10 text-orange-400' : 'bg-white/90 border-slate-200 text-orange-500'}`}
              >
                <Navigation size={24} fill="currentColor" />
              </button>
            </div>

            <motion.div 
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.05}
              animate={{ height: sheetSnap === 0 ? 0 : `${sheetSnap * 100}%` }}
              onDragEnd={(e, info) => {
                if (info.offset.y < -50) setSheetSnap(0.92);
                else if (info.offset.y > 50) setSheetSnap(0.25);
              }}
              className={`bottom-sheet flex flex-col ${isDarkMode ? 'bg-[#12121a] border-white/5' : 'bg-white border-slate-200 shadow-[0_-20px_60px_-15px_rgba(0,0,0,0.1)]'} border-t rounded-t-[40px]`}
            >
              <div className="sheet-drag-handle py-5">
                <div className={`w-14 h-1.5 rounded-full mx-auto ${isDarkMode ? 'bg-white/10' : 'bg-slate-300'}`} />
              </div>
              
              <AnimatePresence mode="wait">
                {selectedLocation ? (
                  <motion.div 
                    key="full-detail"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex-1 flex flex-col overflow-hidden px-6"
                  >
                    <div className="flex justify-between items-start mb-6">
                      <div className="w-20 h-20 bg-orange-400/10 rounded-[28px] flex items-center justify-center text-5xl">
                        {selectedLocation.category}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleShare(selectedLocation)} className={`p-4 rounded-2xl ${isDarkMode ? 'bg-white/5 text-slate-400' : 'bg-slate-100 text-slate-500'} active:scale-95 transition-transform`}><Share2 size={24} /></button>
                        <button onClick={() => { setSelectedLocation(null); setSheetSnap(0.25); }} className={`p-4 rounded-2xl ${isDarkMode ? 'bg-white/5 text-slate-400' : 'bg-slate-100 text-slate-500'} active:scale-95 transition-transform`}><X size={24} /></button>
                      </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto pb-32 scroll-container">
                      <h1 className="text-3xl font-black mb-1">{selectedLocation.name}</h1>
                      <p className="text-slate-400 font-bold mb-8 text-sm flex items-center gap-1.5"><MapPin size={14} className="text-orange-400" /> {selectedLocation.area || 'এলাকা'}</p>
                      
                      <div className="grid grid-cols-2 gap-4 mb-8">
                        <div className={`${isDarkMode ? 'bg-[#1a1a27] border-white/5' : 'bg-slate-50 border-slate-100'} p-5 rounded-3xl border`}>
                          <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">ভোট সংখ্যা</div>
                          <div className="text-2xl font-black text-emerald-500">{toBengaliNumber((selectedLocation.upvotes || 0) + (selectedLocation.downvotes || 0))}</div>
                        </div>
                        <div className={`${isDarkMode ? 'bg-[#1a1a27] border-white/5' : 'bg-slate-50 border-slate-100'} p-5 rounded-3xl border`}>
                          <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">প্যাকেট</div>
                          <div className="text-2xl font-black text-orange-400">{toBengaliNumber(selectedLocation.packets || 0)}</div>
                        </div>
                      </div>

                      {/* Contact Info */}
                      <div className={`mb-8 p-6 rounded-3xl border ${isDarkMode ? 'bg-[#1a1a27] border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                        <div className="text-[10px] font-bold text-slate-500 uppercase mb-3 tracking-widest">যোগাযোগের তথ্য</div>
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-orange-400/10 rounded-2xl flex items-center justify-center text-xl text-orange-400">
                            <User size={24} />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-black text-lg leading-none mb-1">{selectedLocation.contact_name || 'অজানা ইউজার'}</h4>
                            <p className="text-xs font-bold text-slate-500">{selectedLocation.contact_number || 'নাম্বার দেওয়া হয়নি'}</p>
                          </div>
                          {selectedLocation.contact_number && (
                            <a 
                              href={`tel:${selectedLocation.contact_number}`}
                              className="p-3 bg-emerald-500 text-white rounded-xl active:scale-90 transition-transform shadow-lg shadow-emerald-500/20"
                            >
                              <Smartphone size={20} />
                            </a>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-4 mb-10">
                        <button 
                          onClick={() => handleVote(selectedLocation.id, 'up')}
                          className={`flex-1 py-5 rounded-3xl font-black flex items-center justify-center gap-3 transition-all ${voteCounts[selectedLocation.id] === 'up' ? 'bg-emerald-500 text-white shadow-lg' : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'}`}
                        >
                          👍 সত্যি ({toBengaliNumber(selectedLocation.upvotes)})
                        </button>
                        <button 
                          onClick={() => handleVote(selectedLocation.id, 'down')}
                          className={`flex-1 py-5 rounded-3xl font-black flex items-center justify-center gap-3 transition-all ${voteCounts[selectedLocation.id] === 'down' ? 'bg-rose-500 text-white shadow-lg' : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'}`}
                        >
                          👎 মিথ্যা ({toBengaliNumber(selectedLocation.downvotes)})
                        </button>
                      </div>

                      <div className="space-y-6">
                         <h3 className="font-black text-lg flex items-center gap-2">
                           <MessageSquare size={18} className="text-orange-400" /> আপনার মন্তব্য
                         </h3>
                         <div className="flex gap-3">
                           <input 
                            value={newComment} 
                            onChange={e => setNewComment(e.target.value)} 
                            placeholder="মতামত দিন..." 
                            className={`flex-1 ${isDarkMode ? 'bg-[#1a1a27] border-white/5' : 'bg-slate-50 border-slate-200'} border rounded-2xl px-5 py-4 outline-none focus:border-orange-400/50`} 
                           />
                           <button onClick={() => { if(newComment.trim()) { showToast("যোগ হয়েছে"); setNewComment(''); } }} className="bg-orange-400 text-black p-4 rounded-2xl active:scale-95 transition-transform"><Send size={22} /></button>
                         </div>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="listing" className="flex flex-col h-full">
                    <div className={`px-6 py-5 flex items-center justify-between border-b ${isDarkMode ? 'border-white/5' : 'border-slate-100 bg-white rounded-t-[40px]'}`}>
                      <div className="flex flex-col">
                        <h2 className={`text-xl font-black ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{toBengaliNumber(filteredLocations.length)}টি স্পট পাওয়া গেছে</h2>
                        <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest">{selectedDate === new Date().toISOString().split('T')[0] ? 'আজকের আপডেট' : 'গতকালের আপডেট'}</p>
                      </div>
                      <button onClick={() => setSheetSnap(0.92)} className={`p-3 rounded-2xl transition-all active:scale-90 ${isDarkMode ? 'bg-white/5 text-slate-400' : 'bg-slate-100 text-slate-400'}`}><ListIcon size={20}/></button>
                    </div>
                    <div className={`flex-1 overflow-y-auto px-6 pb-24 scroll-container ${isDarkMode ? '' : 'bg-white'}`}>
                      {filteredLocations.map(loc => (
                        <ListingCard 
                          key={loc.id} 
                          loc={loc} 
                          userLocation={userLocation} 
                          isSaved={savedIds.includes(loc.id)}
                          onToggleSave={handleToggleSave}
                          onSelect={(l) => { handleSelectSpotFromList(l); }}
                          isDarkMode={isDarkMode}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        )}

        {activeTab === 'explore' && (
          <div className="h-full w-full p-6 pt-24 overflow-y-auto scroll-container">
            <h1 className="text-2xl font-black mb-6">আশেপাশে কি আছে?</h1>
            <div className="grid grid-cols-2 gap-3 mb-8">
              {CATEGORIES.slice(0, 4).map(c => (
                <button 
                  key={c.id} 
                  onClick={() => setSearchQuery(c.emoji)} 
                  className={`${isDarkMode ? 'bg-[#12121a] border-white/5' : 'bg-white border-slate-200'} border p-5 rounded-[32px] flex flex-col items-center gap-2 active:scale-95 transition-transform shadow-sm`}
                >
                  <span className="text-4xl">{c.emoji}</span>
                  <span className="font-bold text-xs">{c.label}</span>
                </button>
              ))}
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-black mb-4 flex items-center gap-2"><MapPin size={18} className="text-orange-400" /> সব স্পটসমূহ</h2>
              {filteredLocations.map(loc => (
                <ListingCard 
                  key={loc.id} 
                  loc={loc} 
                  userLocation={userLocation} 
                  isSaved={savedIds.includes(loc.id)} 
                  onToggleSave={handleToggleSave} 
                  onSelect={handleSelectSpotFromList} 
                  isDarkMode={isDarkMode}
                />
              ))}
            </div>
          </div>
        )}

        {activeTab === 'saved' && (
          <div className="h-full w-full p-6 pt-24 overflow-y-auto scroll-container">
            <h1 className="text-2xl font-black mb-6">সেভ করা স্পট</h1>
            {savedIds.length === 0 ? (
              <div className="py-20 text-center opacity-30"><Bookmark size={48} className="mx-auto mb-4" /><p className="font-bold">এখনো কিছু সেভ করেননি</p></div>
            ) : (
              <div className="space-y-2">
                {allSpots.filter(l => savedIds.includes(l.id)).map(loc => (
                  <ListingCard 
                    key={loc.id} 
                    loc={loc} 
                    userLocation={userLocation} 
                    isSaved={true} 
                    onToggleSave={handleToggleSave} 
                    onSelect={handleSelectSpotFromList} 
                    isDarkMode={isDarkMode}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="h-full w-full p-6 pt-24 overflow-y-auto scroll-container">
            <div className={`${isDarkMode ? 'bg-[#12121a] border-white/5' : 'bg-white border-slate-200'} rounded-[32px] border p-8 text-center mb-8 shadow-sm`}>
              <div className="w-20 h-20 bg-orange-400/10 rounded-full flex items-center justify-center text-4xl mx-auto mb-4 border-4 border-orange-400/20">👤</div>
              <h2 className="text-xl font-black">{username}</h2>
              <div className="grid grid-cols-3 gap-2 mt-6">
                <div><div className="text-lg font-black text-orange-400">{toBengaliNumber(addedIds.length)}</div><div className="text-[8px] uppercase text-slate-500 font-bold tracking-widest">Added</div></div>
                <div><div className="text-lg font-black text-orange-400">{toBengaliNumber(savedIds.length)}</div><div className="text-[8px] uppercase text-slate-500 font-bold tracking-widest">Saved</div></div>
                <div><div className="text-lg font-black text-orange-400">{toBengaliNumber(Object.keys(voteCounts).length)}</div><div className="text-[8px] uppercase text-slate-500 font-bold tracking-widest">Votes</div></div>
              </div>
            </div>
            <div className={`${isDarkMode ? 'bg-[#12121a] border-white/5' : 'bg-white border-slate-200'} rounded-3xl border p-6 shadow-sm`}>
              <h3 className="font-black text-sm mb-4">অর্জিত ব্যাজ</h3>
              <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
                {addedIds.length >= 1 && <div className="bg-orange-400/10 text-orange-400 px-4 py-2 rounded-xl text-[10px] font-black shrink-0 border border-orange-400/10 flex items-center gap-1.5">🏆 Expert</div>}
                <div className="bg-slate-100 text-slate-400 px-4 py-2 rounded-xl text-[10px] font-black shrink-0 flex items-center gap-1.5">⭐ Contributor</div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Add Spot Form / Multi-step Flow */}
      <AnimatePresence>
        {showAddForm && (
          <>
            {/* ONLY blur if we are in the details step */}
            {addFlowStep === 'details' && (
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }} 
                onClick={() => { setShowAddForm(false); setAddFlowStep('location'); }} 
                className={`fixed inset-0 z-[5500] backdrop-blur-md ${isDarkMode ? 'bg-black/90' : 'bg-slate-900/60'}`} 
              />
            )}
            
            {addFlowStep === 'details' && (
              <motion.div 
                initial={{ y: '100%' }} 
                animate={{ y: 0 }} 
                exit={{ y: '100%' }} 
                className={`fixed bottom-0 inset-x-0 ${isDarkMode ? 'bg-[#12121a]' : 'bg-white'} rounded-t-[40px] z-[5501] max-h-[95vh] flex flex-col p-8 pb-12 shadow-2xl border-t ${isDarkMode ? 'border-white/5' : 'border-slate-100'}`}
              >
                <div className="sheet-drag-handle" />
                
                <motion.div key="step-details" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                  <div className="flex items-center gap-3 mb-2">
                    <button onClick={() => setAddFlowStep('location')} className={`p-2 rounded-xl ${isDarkMode ? 'bg-white/5 text-slate-400' : 'bg-slate-100 text-slate-500'}`}><ArrowRight size={20} className="rotate-180" /></button>
                    <h2 className="text-xl font-black">বিস্তারিত তথ্য দিন</h2>
                  </div>

                  <div className="bg-orange-400/10 p-4 rounded-2xl border border-orange-400/20 mb-4 flex items-center gap-3">
                    <div className="w-10 h-10 bg-orange-400 rounded-xl flex items-center justify-center text-black">
                      <MapPin size={20} />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-orange-400 uppercase tracking-widest leading-none mb-1">নির্বাচিত লোকেশন</p>
                      <p className="text-xs font-bold opacity-70 truncate">{mapCenter[0].toFixed(5)}, {mapCenter[1].toFixed(5)}</p>
                    </div>
                  </div>

                  <input placeholder="স্থানের নাম (যেমন: বায়তুল মোকাররম)" value={newLocation.name} onChange={e => setNewLocation({...newLocation, name: e.target.value})} className={`w-full border p-4 rounded-2xl font-bold outline-none focus:border-orange-400/50 ${isDarkMode ? 'bg-[#1a1a27] border-white/5' : 'bg-slate-50 border-slate-200'}`} />
                  
                  <div className="grid grid-cols-2 gap-3">
                    <select value={newLocation.category} onChange={e => setNewLocation({...newLocation, category: e.target.value})} className={`w-full border p-4 rounded-2xl font-bold appearance-none outline-none focus:border-orange-400/50 ${isDarkMode ? 'bg-[#1a1a27] border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                      {CATEGORIES.map(c => <option key={c.id} value={c.emoji}>{c.emoji} {c.label}</option>)}
                    </select>
                    <input type="number" placeholder="প্যাকেট" value={newLocation.packets} onChange={e => setNewLocation({...newLocation, packets: e.target.value})} className={`w-full border p-4 rounded-2xl font-bold outline-none focus:border-orange-400/50 ${isDarkMode ? 'bg-[#1a1a27] border-white/5' : 'bg-slate-50 border-slate-200'}`} />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <input placeholder="আপনার নাম" value={newLocation.contact_name} onChange={e => setNewLocation({...newLocation, contact_name: e.target.value})} className={`w-full border p-4 rounded-2xl font-bold outline-none focus:border-orange-400/50 ${isDarkMode ? 'bg-[#1a1a27] border-white/5' : 'bg-slate-50 border-slate-200'}`} />
                    <input placeholder="ফোন নাম্বার (ঐচ্ছিক)" value={newLocation.contact_number} onChange={e => setNewLocation({...newLocation, contact_number: e.target.value})} className={`w-full border p-4 rounded-2xl font-bold outline-none focus:border-orange-400/50 ${isDarkMode ? 'bg-[#1a1a27] border-white/5' : 'bg-slate-50 border-slate-200'}`} />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase ml-2 tracking-widest">বন্ধ হওয়ার তারিখ</label>
                    <input 
                      type="date" 
                      min={new Date().toISOString().split('T')[0]}
                      value={newLocation.expiry_date} 
                      onChange={e => setNewLocation({...newLocation, expiry_date: e.target.value})} 
                      className={`w-full border p-4 rounded-2xl font-bold outline-none focus:border-orange-400/50 ${isDarkMode ? 'bg-[#1a1a27] border-white/5' : 'bg-slate-50 border-slate-200'}`} 
                    />
                  </div>

                  <textarea placeholder="বিস্তারিত তথ্য (ঐচ্ছিক)" value={newLocation.notes} onChange={e => setNewLocation({...newLocation, notes: e.target.value})} className={`w-full border p-4 rounded-2xl font-bold outline-none focus:border-orange-400/50 h-24 resize-none ${isDarkMode ? 'bg-[#1a1a27] border-white/5' : 'bg-slate-50 border-slate-200'}`} />

                  <button onClick={handleAddSubmit} className="w-full bg-orange-400 text-black py-5 rounded-[24px] font-black text-lg shadow-2xl shadow-orange-400/20 active:scale-95 transition-all">পাবলিশ করুন 🚀</button>
                </motion.div>
              </motion.div>
            )}
          </>
        )}
      </AnimatePresence>

      {/* Bottom Navigation */}
      <nav className={`fixed bottom-0 inset-x-0 h-[80px] border-t flex items-center justify-around px-4 z-[4000] safe-p-bottom transition-all ${isDarkMode ? 'bg-[#12121a]/95 border-white/5 backdrop-blur-xl' : 'bg-white border-slate-200'} ${showAddForm && addFlowStep === 'location' ? 'translate-y-full opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'}`}>
        <button onClick={() => { setActiveTab('map'); setSheetSnap(0.25); setSelectedLocation(null); }} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'map' ? 'text-orange-400' : 'text-slate-500'}`}>
          <MapIcon size={22} />
          <span className="text-[8px] font-bold uppercase tracking-widest">Map</span>
        </button>
        <button onClick={() => { setActiveTab('explore'); setSheetSnap(0.25); }} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'explore' ? 'text-orange-400' : 'text-slate-500'}`}>
          <Search size={22} />
          <span className="text-[8px] font-bold uppercase tracking-widest">Explore</span>
        </button>
        
        <div className="relative -top-6">
          <button onClick={() => { setMapZoom(16); setShowAddForm(true); setAddFlowStep('location'); }} className="w-14 h-14 bg-orange-400 text-black rounded-2xl shadow-2xl shadow-orange-400/20 flex items-center justify-center border-4 transition-all active:scale-90" style={{ borderColor: isDarkMode ? '#0a0a0f' : '#f8fafc' }}>
            <Plus size={32} strokeWidth={3} />
          </button>
        </div>

        <button onClick={() => { setActiveTab('saved'); setSheetSnap(0.25); }} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'saved' ? 'text-orange-400' : 'text-slate-500'}`}>
          <Bookmark size={22} />
          <span className="text-[8px] font-bold uppercase tracking-widest">Saved</span>
        </button>
        <button onClick={() => { setActiveTab('profile'); setSheetSnap(0.25); }} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'profile' ? 'text-orange-400' : 'text-slate-500'}`}>
          <User size={22} />
          <span className="text-[8px] font-bold uppercase tracking-widest">Profile</span>
        </button>
      </nav>
    </div>
  );
};

export default App;
