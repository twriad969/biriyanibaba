import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { db, initDb } from './db';
import { 
  Map as MapIcon, Search, Plus, Bookmark, User, 
  MapPin, Clock, MessageSquare, Send, 
  X, Info, CheckCircle, XCircle, 
  Navigation, Share2, Award, Moon, Sun,
  Smartphone, ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CATEGORIES, PRICE_RANGES, TAG_OPTIONS, 
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
  if (dist < 1) return `${toBengaliNumber((dist * 1000).toFixed(0))} মিটার দূরে`;
  return `${toBengaliNumber(dist.toFixed(1))} কিমি দূরে`;
};

// --- Custom Icons ---
const getMarkerIcon = (category, upvotes, downvotes, isSelected) => {
  const cat = CATEGORIES.find(c => c.emoji === category) || CATEGORIES[0];
  const isFake = (downvotes - upvotes >= 5);
  const color = isFake ? '#ef4444' : cat.color;
  
  return L.divIcon({
    html: `<div class="marker-container ${isSelected ? 'selected' : ''}" style="--color: ${color}">
      <div class="marker-inner">${category || '🍛'}</div>
      ${upvotes > 0 ? `<div class="badge">${toBengaliNumber(upvotes)}</div>` : ''}
    </div>`,
    className: '',
    iconSize: [44, 44],
    iconAnchor: [22, 22]
  });
};

const userIcon = L.divIcon({
  html: `<div class="user-pulse"></div>`,
  className: '',
  iconSize: [20, 20],
  iconAnchor: [10, 10]
});

// --- Components ---

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

const SkeletonCard = () => (
  <div className="skeleton-card p-4 rounded-3xl flex gap-4 items-center bg-[#12121a]">
    <div className="w-14 h-14 bg-white/5 rounded-2xl animate-pulse" />
    <div className="flex-1 space-y-2">
      <div className="h-4 bg-white/5 rounded w-3/4 animate-pulse" />
      <div className="h-3 bg-white/5 rounded w-1/2 animate-pulse" />
    </div>
  </div>
);

const ListingCard = memo(({ loc, userLocation, isSaved, onToggleSave, onSelect }) => {
  const distance = useMemo(() => {
    if (!userLocation) return null;
    return calculateDistance(userLocation.lat, userLocation.lng, loc.lat, loc.lng);
  }, [userLocation, loc.lat, loc.lng]);

  const walkTime = useMemo(() => distance ? Math.round((distance / WALKING_SPEED) * 60) : null, [distance]);
  const driveTime = useMemo(() => distance ? Math.round((distance / DRIVING_SPEED) * 60) : null, [distance]);
  
  const sentimentColor = loc.downvotes > loc.upvotes ? 'border-rose-500' : (loc.upvotes > 0 ? 'border-emerald-500' : 'border-transparent');

  return (
    <motion.div 
      whileTap={{ scale: 0.97 }}
      onClick={() => onSelect(loc)}
      className={`bg-[#12121a] border-l-4 ${sentimentColor} p-4 rounded-3xl flex gap-4 items-center active:bg-[#1a1a27] transition-all`}
    >
      <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center text-3xl shrink-0">
        {loc.category || '🍛'}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-bold text-slate-100 truncate text-sm">{loc.name}</h3>
        <div className="flex items-center gap-2 mt-1 text-[10px] font-bold text-slate-500">
          <MapPin size={10} className="text-orange-400" />
          <span>{formatDistanceBN(distance)}</span>
          <span className="opacity-30">|</span>
          <span>{loc.price_range || '৳'}</span>
        </div>
        <div className="flex items-center gap-3 mt-2 text-[10px] font-bold text-slate-400">
          <span>🚶 {walkTime ? toBengaliNumber(walkTime) : '?'} মি</span>
          <span>🚗 {driveTime ? toBengaliNumber(driveTime) : '?'} মি</span>
        </div>
      </div>
      <button 
        onClick={(e) => { e.stopPropagation(); onToggleSave(loc.id); }}
        className={`p-3 tap-target ${isSaved ? 'text-orange-400' : 'text-slate-600'}`}
      >
        <Bookmark size={20} fill={isSaved ? "currentColor" : "none"} />
      </button>
    </motion.div>
  );
});

// --- Main App ---

const App = () => {
  // --- States ---
  const [activeTab, setActiveTab] = useState('map');
  const [showSplash, setShowSplash] = useState(!sessionStorage.getItem('splash_shown'));
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  
  const [username, setUsername] = useState(() => localStorage.getItem('bzone_username') || '');
  const [userAvatar, setUserAvatar] = useState(() => localStorage.getItem('bzone_avatar') || '🍛');
  
  const [userLocation, setUserLocation] = useState(null);
  const [mapCenter, setMapCenter] = useState(DHAKA_COORDS);
  const [mapZoom, setMapZoom] = useState(15);
  const [flyTo, setFlyTo] = useState(false);
  
  const [locations, setLocations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLocation, setSelectedLocation] = useState(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState(() => JSON.parse(localStorage.getItem('recent_searches') || '[]'));
  
  const [savedIds, setSavedIds] = useState(() => JSON.parse(localStorage.getItem('userBookmarks') || '[]'));
  const [addedIds, setAddedIds] = useState(() => JSON.parse(localStorage.getItem('userAddedListings') || '[]'));
  const [voteCounts, setVoteCounts] = useState(() => JSON.parse(localStorage.getItem('userVotes') || '{}'));
  
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLocation, setNewLocation] = useState({ name: '', category: '🍛', price_range: '৳', expiry_date: '', notes: '', tags: [], packets: '' });
  
  const [toast, setToast] = useState(null);
  const [sheetSnap, setSheetSnap] = useState(0.25);
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('theme') !== 'light');
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');

  // --- Derived State ---
  const filteredLocations = useMemo(() => {
    if (!searchQuery.trim()) return locations;
    const q = searchQuery.toLowerCase();
    return locations.filter(l => 
      l.name.toLowerCase().includes(q) || 
      l.area.toLowerCase().includes(q)
    );
  }, [searchQuery, locations]);

  // --- Effects ---
  useEffect(() => {
    if (showSplash) {
      sessionStorage.setItem('splash_shown', 'true');
      setTimeout(() => setShowSplash(false), 2000);
    }
    if (!localStorage.getItem('onboarding_complete')) {
      setTimeout(() => setShowOnboarding(true), showSplash ? 2100 : 0);
    }
    initDb().then(fetchLocations);
    
    // Geolocation
    if (navigator.geolocation) {
      navigator.geolocation.watchPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserLocation(loc);
        },
        null,
        { enableHighAccuracy: true }
      );
    }

    // PWA Prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });

    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('userBookmarks', JSON.stringify(savedIds));
    localStorage.setItem('userAddedListings', JSON.stringify(addedIds));
    localStorage.setItem('userVotes', JSON.stringify(voteCounts));
    localStorage.setItem('recent_searches', JSON.stringify(recentSearches));
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    document.documentElement.classList.toggle('light', !isDarkMode);
  }, [savedIds, addedIds, voteCounts, recentSearches, isDarkMode]);

  // --- Functions ---
  const fetchLocations = async () => {
    setIsLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      // Auto-remove expired
      await db.execute({
        sql: "DELETE FROM locations WHERE expiry_date < ? AND expiry_date != '' AND expiry_date IS NOT NULL",
        args: [today]
      });
      
      const result = await db.execute({
        sql: "SELECT * FROM locations WHERE (expiry_date >= ? OR expiry_date = '' OR expiry_date IS NULL) ORDER BY created_at DESC",
        args: [today]
      });
      setLocations(result.rows);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const handleToggleSave = useCallback((id) => {
    setSavedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    showToast(savedIds.includes(id) ? "🔖 রিমুভ করা হয়েছে" : "🔖 সেভ করা হয়েছে");
  }, [savedIds, showToast]);

  const searchTimeout = useRef(null);
  const handleSearchChange = (val) => {
    setSearchQuery(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      if (val.trim() && !recentSearches.includes(val)) {
        setRecentSearches(prev => [val, ...prev.slice(0, 4)]);
      }
    }, 300);
  };

  const handleVote = async (id, type) => {
    if (voteCounts[id]) return showToast("ইতিমধ্যে ভোট দিয়েছেন");
    const field = type === 'up' ? 'upvotes' : 'downvotes';
    try {
      await db.execute({ sql: `UPDATE locations SET ${field} = ${field} + 1 WHERE id = ?`, args: [id] });
      setVoteCounts(prev => ({ ...prev, [id]: type }));
      fetchLocations();
      if (selectedLocation?.id === id) {
        setSelectedLocation(prev => ({ ...prev, [field]: prev[field] + 1 }));
      }
      showToast("✅ ভোট সফল");
    } catch (e) {
      showToast("❌ ভোট ব্যর্থ");
    }
  };

  const handleAddSubmit = async () => {
    if (!newLocation.name.trim()) return showToast("নাম দিন!");
    setIsLoading(true);
    try {
      const id = Math.random().toString(36).substr(2, 9);
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${mapCenter[0]}&lon=${mapCenter[1]}&format=json`);
      const data = await res.json();
      const area = data.address.suburb || data.address.city || "ঢাকা";

      await db.execute({
        sql: `INSERT INTO locations (id, name, area, time, lat, lng, date, category, expiry_date, notes, packets) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          id, newLocation.name, area, new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 
          mapCenter[0], mapCenter[1], today, newLocation.category, newLocation.expiry_date, newLocation.notes, 
          parseInt(newLocation.packets) || 0
        ]
      });

      setAddedIds(prev => [...prev, id]);
      setShowAddForm(false);
      setNewLocation({ name: '', category: '🍛', price_range: '৳', expiry_date: '', notes: '', tags: [], packets: '' });
      fetchLocations();
      setFlyTo(true);
      showToast("✅ যোগ করা হয়েছে");
    } catch (e) {
      showToast("❌ ব্যর্থ হয়েছে");
    } finally {
      setIsLoading(false);
    }
  };

  const handleShare = async (loc) => {
    const text = `${loc.name} (${loc.area}) - বিরিয়ানি Zone-এ দেখুন!`;
    const url = window.location.href;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text + " " + url)}`;
    
    if (navigator.share) {
      try {
        await navigator.share({ title: 'BZone Spot', text, url });
      } catch (e) {
        window.open(whatsappUrl, '_blank');
      }
    } else {
      window.open(whatsappUrl, '_blank');
      showToast("📲 হোয়াটসঅ্যাপ-এ শেয়ার করা হচ্ছে");
    }
  };

  const scrollToTop = () => {
    const panels = document.querySelectorAll('.overflow-y-auto');
    panels.forEach(p => p.scrollTo({ top: 0, behavior: 'smooth' }));
  };

  // --- Render Helpers ---

  const MapEvents = () => {
    const timerRef = useRef(null);
    useMapEvents({
      mousedown: (e) => {
        timerRef.current = setTimeout(() => {
          setMapCenter([e.latlng.lat, e.latlng.lng]);
          setShowAddForm(true);
        }, 600);
      },
      mouseup: () => clearTimeout(timerRef.current),
      touchstart: (e) => {
        timerRef.current = setTimeout(() => {
          setMapCenter([e.latlng.lat, e.latlng.lng]);
          setShowAddForm(true);
        }, 600);
      },
      touchend: () => clearTimeout(timerRef.current),
      click: () => {
        if (sheetSnap > 0.3) setSheetSnap(0.25);
      }
    });
    return null;
  };

  if (showSplash) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0f] z-[9999] flex flex-col items-center justify-center">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5 }}>
          <div className="text-9xl mb-4">🍛</div>
          <h1 className="text-4xl font-black text-orange-400 font-syne">BZone</h1>
        </motion.div>
      </div>
    );
  }

  if (showOnboarding) {
    const slides = [
      { icon: "🍛", title: "স্বাগতম!", desc: "আপনার আশেপাশের সেরা খাবার আর মসজিদ খুঁজুন" },
      { icon: "📍", title: "লোকেশন শেয়ার", desc: "লোকেশন শেয়ার করুন, কাছের স্পট দেখুন" },
      { icon: "✏️", title: "যোগ করুন", desc: "আপনিও যোগ করুন নতুন স্পট!" }
    ];
    return (
      <div className="fixed inset-0 bg-[#0a0a0f] z-[9998] flex flex-col p-8 safe-p-top safe-p-bottom">
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <AnimatePresence mode="wait">
            <motion.div key={onboardingStep} initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} className="space-y-6">
              <div className="text-9xl mb-4">{slides[onboardingStep].icon}</div>
              <h2 className="text-4xl font-black">{slides[onboardingStep].title}</h2>
              <p className="text-slate-400 text-lg">{slides[onboardingStep].desc}</p>
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="space-y-8">
          {onboardingStep === 2 && (
            <input 
              placeholder="আপনার নাম" 
              value={tempUsername} 
              onChange={e => setTempUsername(e.target.value)}
              className="w-full bg-[#12121a] border border-white/10 rounded-2xl p-4 font-bold outline-none focus:border-orange-400"
            />
          )}
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              {[0, 1, 2].map(i => <div key={i} className={`onboarding-dot ${onboardingStep === i ? 'active' : ''}`} />)}
            </div>
            <button 
              onClick={() => {
                if (onboardingStep < 2) setOnboardingStep(onboardingStep + 1);
                else {
                  if (tempUsername.trim()) {
                    localStorage.setItem('bzone_username', tempUsername);
                    setUsername(tempUsername);
                  }
                  localStorage.setItem('onboarding_complete', 'true');
                  setShowOnboarding(false);
                }
              }}
              className="bg-orange-400 text-black px-6 py-3 rounded-2xl font-black flex items-center gap-2"
            >
              {onboardingStep === 2 ? "শুরু করি" : "পরবর্তী"} <ArrowRight size={20} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-[#0a0a0f] text-slate-100 overflow-hidden relative font-bengali">
      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }} className="fixed bottom-24 inset-x-0 z-[6000] flex justify-center px-6 pointer-events-none">
            <div className="bg-[#1a1a27] border border-white/10 px-6 py-3 rounded-full shadow-2xl flex items-center gap-2 text-sm font-bold pointer-events-auto">
              <Info size={16} className="text-orange-400" /> {toast}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="h-full w-full pb-[80px]">
        <AnimatePresence mode="wait">
          {activeTab === 'map' && (
            <motion.div key="map" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full w-full">
              <MapContainer center={mapCenter} zoom={mapZoom} zoomControl={false} className="h-full w-full dark-map">
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <MapController center={mapCenter} zoom={mapZoom} flyTo={flyTo} />
                <MapEvents />
                {locations.map(loc => (
                  <Marker 
                    key={loc.id} 
                    position={[loc.lat, loc.lng]} 
                    icon={getMarkerIcon(loc.category, loc.upvotes, loc.downvotes, selectedLocation?.id === loc.id)}
                    eventHandlers={{ click: () => { setSelectedLocation(loc); setSheetSnap(0.55); } }}
                  />
                ))}
                {userLocation && <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon} />}
              </MapContainer>

              {/* Snapable Bottom Sheet */}
              <motion.div 
                drag="y"
                dragConstraints={{ top: -window.innerHeight * 0.9, bottom: 0 }}
                onDragEnd={(e, info) => {
                  const y = -info.offset.y;
                  if (y > 300) setSheetSnap(0.92);
                  else if (y > 100) setSheetSnap(0.55);
                  else setSheetSnap(0.25);
                }}
                animate={{ height: `${sheetSnap * 100}%` }}
                className="bottom-sheet flex flex-col"
              >
                <div className="sheet-drag-handle" />
                <div className="p-6 pb-2">
                  <h2 className="text-xl font-black">{toBengaliNumber(locations.length)}টি স্পট পাওয়া গেছে</h2>
                  <div className="flex gap-2 mt-3 overflow-x-auto scrollbar-hide pb-2">
                    <button onClick={() => setSearchQuery('')} className={`px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap ${searchQuery === '' ? 'bg-orange-400 text-black' : 'bg-white/5 text-slate-400'}`}>সব</button>
                    <button onClick={() => setSearchQuery('মসজিদ')} className={`px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap ${searchQuery === 'মসজিদ' ? 'bg-indigo-500 text-white' : 'bg-white/5 text-slate-400'}`}>🕌 মসজিদ</button>
                    <button onClick={() => setSearchQuery('বিরিয়ানি')} className={`px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap ${searchQuery === 'বিরিয়ানি' ? 'bg-emerald-500 text-white' : 'bg-white/5 text-slate-400'}`}>🍛 বিরিয়ানি</button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-6 space-y-3 pb-20">
                  {isLoading ? <SkeletonCard /> : 
                    filteredLocations.map(loc => (
                      <ListingCard 
                        key={loc.id} 
                        loc={loc} 
                        userLocation={userLocation} 
                        isSaved={savedIds.includes(loc.id)}
                        onToggleSave={handleToggleSave}
                        onSelect={(l) => { setSelectedLocation(l); setSheetSnap(0.92); }}
                      />
                    ))
                  }
                </div>
              </motion.div>
            </motion.div>
          )}

          {activeTab === 'explore' && (
            <motion.div key="explore" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="h-full w-full p-6 safe-p-top overflow-y-auto">
              <h1 className="text-3xl font-black mb-6 font-syne">Explore</h1>
              <div className="relative mb-6">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                <input 
                  placeholder="খাবার বা এলাকা খুঁজুন..."
                  value={searchQuery}
                  onChange={e => handleSearchChange(e.target.value)}
                  className="w-full bg-[#12121a] border border-white/5 rounded-2xl py-4 pl-12 pr-4 font-bold outline-none focus:border-orange-400"
                />
              </div>
              <div className="grid grid-cols-2 gap-4 mb-8">
                {CATEGORIES.map(c => (
                  <button key={c.id} onClick={() => handleSearchChange(c.emoji)} className="bg-[#12121a] p-4 rounded-3xl border border-white/5 flex flex-col items-center gap-2 press-scale">
                    <span className="text-4xl">{c.emoji}</span>
                    <span className="font-bold text-sm">{c.label}</span>
                  </button>
                ))}
              </div>
              <div className="space-y-4">
                <h2 className="text-xl font-black flex items-center gap-2"><MapPin size={20} className="text-orange-400" /> কাছের স্পট</h2>
                {filteredLocations.slice(0, 20).map(loc => (
                  <ListingCard key={loc.id} loc={loc} userLocation={userLocation} isSaved={savedIds.includes(loc.id)} onToggleSave={handleToggleSave} onSelect={setSelectedLocation} />
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'saved' && (
            <motion.div key="saved" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="h-full w-full p-6 safe-p-top overflow-y-auto">
              <h1 className="text-3xl font-black mb-8 font-syne">Saved</h1>
              {savedIds.length === 0 ? (
                <div className="py-20 text-center opacity-40"><div className="text-7xl mb-4">🔖</div><p className="font-bold">এখনো কিছু সেভ করেননি</p></div>
              ) : (
                <div className="space-y-4">
                  {locations.filter(l => savedIds.includes(l.id)).map(loc => (
                    <ListingCard key={loc.id} loc={loc} userLocation={userLocation} isSaved={true} onToggleSave={handleToggleSave} onSelect={setSelectedLocation} />
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'profile' && (
            <motion.div key="profile" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="h-full w-full p-6 safe-p-top overflow-y-auto">
              <div className="flex items-center justify-between mb-8">
                <h1 className="text-3xl font-black font-syne">Profile</h1>
                <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-3 bg-white/5 rounded-2xl">{isDarkMode ? <Sun size={20} /> : <Moon size={20} />}</button>
              </div>
              <div className="bg-[#12121a] rounded-[40px] p-8 mb-8 text-center border border-white/5">
                <div className="w-24 h-24 bg-orange-400/10 rounded-full flex items-center justify-center text-5xl mx-auto mb-4 border-4 border-orange-400/20">{userAvatar}</div>
                <h2 className="text-2xl font-black mb-1">{username || 'User'}</h2>
                <div className="grid grid-cols-3 gap-4 mt-8">
                  <div>
                    <div className="text-xl font-black text-orange-400">{toBengaliNumber(addedIds.length)}</div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase">Added</div>
                  </div>
                  <div>
                    <div className="text-xl font-black text-orange-400">
                      {toBengaliNumber(locations.filter(l => addedIds.includes(l.id)).reduce((acc, curr) => acc + (curr.upvotes || 0), 0))}
                    </div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase">Upvotes</div>
                  </div>
                  <div>
                    <div className="text-xl font-black text-orange-400">{toBengaliNumber(savedIds.length)}</div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase">Saved</div>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <h3 className="font-black text-lg flex items-center gap-2"><Award size={20} className="text-orange-400" /> অর্জিত ব্যাজ</h3>
                <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                  {addedIds.length >= 3 && <div className="bg-orange-400/10 border border-orange-400/20 px-4 py-3 rounded-2xl shrink-0 text-orange-400 font-black">Expert 🏆</div>}
                  {addedIds.length >= 1 && <div className="bg-emerald-400/10 border border-emerald-400/20 px-4 py-3 rounded-2xl shrink-0 text-emerald-400 font-black">Contributor ⭐</div>}
                  {locations.filter(l => addedIds.includes(l.id)).reduce((acc, curr) => acc + (curr.upvotes || 0), 0) >= 50 && 
                    <div className="bg-yellow-400/10 border border-yellow-400/20 px-4 py-3 rounded-2xl shrink-0 text-yellow-400 font-black">Community Star ⭐</div>
                  }
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Nav */}
      <nav className="bottom-tab-bar">
        {[
          { id: 'map', icon: MapIcon, label: 'Map' },
          { id: 'explore', icon: Search, label: 'Explore' },
          { id: 'add', icon: Plus, label: 'Add', special: true },
          { id: 'saved', icon: Bookmark, label: 'Saved' },
          { id: 'profile', icon: User, label: 'Profile' }
        ].map(tab => (
          tab.special ? (
            <div key={tab.id} className="flex-1 flex justify-center">
              <button onClick={() => { setMapZoom(16); setShowAddForm(true); }} className="add-tab-button press-scale"><Plus size={32} strokeWidth={3} /></button>
            </div>
          ) : (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id); scrollToTop(); }} className={`tab-item ${activeTab === tab.id ? 'active' : ''}`}>
              <div className="tab-icon-wrapper"><tab.icon size={24} /></div>
              <span className="text-[10px] font-black uppercase tracking-tighter">{tab.label}</span>
            </button>
          )
        ))}
      </nav>

      {/* Detail Bottom Sheet */}
      <AnimatePresence>
        {selectedLocation && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedLocation(null)} className="fixed inset-0 bg-black/80 z-[5000] backdrop-blur-sm" />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="fixed bottom-0 inset-x-0 bg-[#12121a] rounded-t-[40px] z-[5001] max-h-[90vh] flex flex-col safe-p-bottom">
              <div className="sheet-drag-handle" />
              <div className="flex-1 overflow-y-auto px-8 pb-12">
                <div className="flex justify-between items-start mb-6">
                  <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center text-5xl">{selectedLocation.category}</div>
                  <div className="flex gap-2">
                    <button onClick={() => handleShare(selectedLocation)} className="p-4 bg-white/5 rounded-2xl text-slate-400"><Share2 size={24} /></button>
                    <button onClick={() => setSelectedLocation(null)} className="p-4 bg-white/5 rounded-2xl text-slate-400"><X size={24} /></button>
                  </div>
                </div>
                <h1 className="text-3xl font-black mb-2">{selectedLocation.name}</h1>
                <p className="text-slate-400 font-bold mb-8">{selectedLocation.area}</p>
                
                <div className="grid grid-cols-2 gap-4 mb-8">
                  <div className="bg-[#1a1a27] p-4 rounded-3xl">
                    <div className="text-[10px] font-black text-slate-500 uppercase mb-1">Upvotes</div>
                    <div className="text-2xl font-black text-emerald-500">{toBengaliNumber(selectedLocation.upvotes)}</div>
                  </div>
                  <div className="bg-[#1a1a27] p-4 rounded-3xl">
                    <div className="text-[10px] font-black text-slate-500 uppercase mb-1">Downvotes</div>
                    <div className="text-2xl font-black text-rose-500">{toBengaliNumber(selectedLocation.downvotes)}</div>
                  </div>
                </div>

                <div className="flex gap-4 mb-8">
                  <button onClick={() => handleVote(selectedLocation.id, 'up')} className="flex-1 bg-emerald-500/10 text-emerald-500 py-4 rounded-2xl font-black border border-emerald-500/20 active:scale-95 transition-all">👍 সত্য</button>
                  <button onClick={() => handleVote(selectedLocation.id, 'down')} className="flex-1 bg-rose-500/10 text-rose-500 py-4 rounded-2xl font-black border border-rose-500/20 active:scale-95 transition-all">👎 মিথ্যা</button>
                </div>

                <div className="space-y-4">
                   <h3 className="font-black text-lg">মন্তব্য করুন</h3>
                   <div className="flex gap-3">
                     <input value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="মতামত দিন..." className="flex-1 bg-[#1a1a27] border border-white/5 rounded-2xl px-4 py-3 outline-none focus:border-orange-400" />
                     <button onClick={() => { if(newComment.trim()) showToast("কমেন্ট যোগ হয়েছে"); setNewComment(''); }} className="bg-orange-400 text-black p-4 rounded-2xl"><Send size={20} /></button>
                   </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Add Form */}
      <AnimatePresence>
        {showAddForm && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAddForm(false)} className="fixed inset-0 bg-black/95 z-[5500] backdrop-blur-md" />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="fixed bottom-0 inset-x-0 bg-[#12121a] rounded-t-[40px] z-[5501] max-h-[95vh] flex flex-col safe-p-bottom">
              <div className="sheet-drag-handle" />
              <div className="p-8 space-y-6">
                <h2 className="text-2xl font-black">নতুন খবর দিন 🚀</h2>
                <input 
                  placeholder="স্থানের নাম (উদা: বায়তুল মোকাররম)" 
                  value={newLocation.name}
                  onChange={e => setNewLocation({...newLocation, name: e.target.value})}
                  className="w-full bg-[#1a1a27] border border-white/5 p-4 rounded-2xl font-bold" 
                />
                <div className="grid grid-cols-2 gap-4">
                  <select value={newLocation.category} onChange={e => setNewLocation({...newLocation, category: e.target.value})} className="bg-[#1a1a27] border border-white/5 p-4 rounded-2xl font-bold appearance-none">
                    {CATEGORIES.map(c => <option key={c.id} value={c.emoji}>{c.emoji} {c.label}</option>)}
                  </select>
                  <input 
                    type="number"
                    placeholder="প্যাকেট সংখ্যা" 
                    value={newLocation.packets}
                    onChange={e => setNewLocation({...newLocation, packets: e.target.value})}
                    className="bg-[#1a1a27] border border-white/5 p-4 rounded-2xl font-bold" 
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <select value={newLocation.price_range} onChange={e => setNewLocation({...newLocation, price_range: e.target.value})} className="bg-[#1a1a27] border border-white/5 p-4 rounded-2xl font-bold appearance-none">
                    {PRICE_RANGES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <input 
                    type="date"
                    value={newLocation.expiry_date}
                    onChange={e => setNewLocation({...newLocation, expiry_date: e.target.value})}
                    className="bg-[#1a1a27] border border-white/5 p-4 rounded-2xl font-bold" 
                  />
                </div>
                <button onClick={handleAddSubmit} disabled={isLoading} className="w-full bg-orange-400 text-black py-5 rounded-3xl font-black text-xl shadow-2xl">
                  {isLoading ? "লোড হচ্ছে..." : "যোগ করুন →"}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;
