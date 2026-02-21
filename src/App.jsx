import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';
import 'leaflet/dist/leaflet.css';
import { db, initDb } from './db';
import { 
  Map as MapIcon, Search, Plus, Bookmark, User, 
  MapPin, Clock, Package, MessageSquare, Send, 
  X, ChevronRight, Info, CheckCircle, XCircle, 
  Navigation, Share2, Edit3, Award, Moon, Sun,
  Smartphone, Trash2, ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';

// --- Constants & Config ---
const DHAKA_COORDS = [23.8103, 90.4125];
const CATEGORIES = [
  { id: 'biryani', label: 'বিরিয়ানি', emoji: '🍛', color: '#f5a623' },
  { id: 'mosque', label: 'মসজিদ', emoji: '🕌', color: '#818cf8' },
  { id: 'khichuri', label: 'খিচুড়ি', emoji: '🥘', color: '#f59e0b' },
  { id: 'iftar', label: 'イফতার', emoji: '🌙', color: '#f43f5e' },
  { id: 'water', label: 'পানি/শরবত', emoji: '🥤', color: '#0ea5e9' },
  { id: 'other', label: 'অন্যান্য', emoji: '🎁', color: '#64748b' },
];

const PRICE_RANGES = ['৳', '৳৳', '৳৳৳'];
const TAG_OPTIONS = [
  { id: 'spicy', label: 'spicy 🌶️' },
  { id: 'halal', label: 'halal ✅' },
  { id: 'family', label: 'family-friendly 👨‍👩‍👧' },
  { id: 'late', label: 'open late 🌙' }
];

const WALKING_SPEED = 5; // km/h
const DRIVING_SPEED = 30; // km/h

// --- Helper Functions ---
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
};

const formatDistance = (dist) => {
  if (dist === null || isNaN(dist)) return "দূরত্ব অজানা";
  return dist < 1 ? `${(dist * 1000).toFixed(0)} মিটার` : `${dist.toFixed(1)} কিমি দূরে`;
};

const calculateTravelTime = (dist, speed) => {
  if (dist === null || isNaN(dist)) return null;
  const hours = dist / speed;
  const minutes = Math.round(hours * 60);
  return minutes;
};

const getMarkerIcon = (category, upvotes, downvotes, isSelected) => {
  const cat = CATEGORIES.find(c => c.emoji === category) || CATEGORIES[0];
  const isFake = (downvotes - upvotes >= 5);
  const color = isFake ? '#ef4444' : cat.color;
  
  return L.divIcon({
    html: `<div class="flex items-center justify-center w-12 h-12 bg-[#12121a] rounded-2xl shadow-2xl border-2 ${isSelected ? 'border-orange-400 scale-110' : 'border-white/10'} transition-all relative">
      <div style="background-color: ${color}20; color: ${color}" class="w-full h-full rounded-xl flex items-center justify-center text-2xl">
        ${category || '🍛'}
      </div>
      ${upvotes > 0 ? `<div class="absolute -top-2 -right-2 bg-emerald-600 text-white px-2 py-0.5 rounded-full text-[10px] font-black border-2 border-[#12121a]">${upvotes}</div>` : ''}
    </div>`,
    className: '',
    iconSize: [48, 48],
    iconAnchor: [24, 24]
  });
};

// --- Components ---

const MapController = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, zoom || map.getZoom());
  }, [center, zoom, map]);
  return null;
};

const SkeletonLoader = () => (
  <div className="space-y-4">
    {[1, 2, 3].map(i => (
      <div key={i} className="skeleton-card w-full p-5 flex gap-4 items-center">
        <div className="w-14 h-14 bg-white/5 rounded-2xl" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-white/5 rounded w-3/4" />
          <div className="h-3 bg-white/5 rounded w-1/2" />
        </div>
      </div>
    ))}
  </div>
);

const App = () => {
  // --- State ---
  const [activeTab, setActiveTab] = useState('map');
  const [showSplash, setShowSplash] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [username, setUsername] = useState(localStorage.getItem('bzone_username') || '');
  const [userAvatar, setUserAvatar] = useState(localStorage.getItem('bzone_avatar') || '🍛');
  
  const [userLocation, setUserLocation] = useState(null);
  const [mapCenter, setMapCenter] = useState(DHAKA_COORDS);
  const [mapZoom, setMapZoom] = useState(15);
  
  const [locations, setLocations] = useState([]);
  const [filteredLocations, setFilteredLocations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLocation, setSelectedLocation] = useState(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState(JSON.parse(localStorage.getItem('recent_searches') || '[]'));
  
  const [savedIds, setSavedIds] = useState(JSON.parse(localStorage.getItem('userBookmarks') || '[]'));
  const [addedIds, setAddedIds] = useState(JSON.parse(localStorage.getItem('userAddedListings') || '[]'));
  const [voteCounts, setVoteCounts] = useState(JSON.parse(localStorage.getItem('userVotes') || '{}'));
  
  const [newLocation, setNewLocation] = useState({
    name: '',
    category: '🍛',
    price_range: '৳',
    expiry_date: '',
    notes: '',
    tags: []
  });

  const handleAddSubmit = async () => {
    if (!newLocation.name.trim()) return showToast("নাম দিন!");
    
    setIsLoading(true);
    try {
      const id = Math.random().toString(36).substr(2, 9);
      const today = new Date().toISOString().split('T')[0];
      
      // Get area name from coords
      let area = "ঢাকা";
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${mapCenter[0]}&lon=${mapCenter[1]}&format=json`);
        const data = await res.json();
        area = data.address.suburb || data.address.neighbourhood || data.address.city || "ঢাকা";
      } catch (e) {}

      await db.execute({
        sql: `INSERT INTO locations (id, name, area, time, lat, lng, date, category, expiry_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          id, newLocation.name, area, new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 
          mapCenter[0], mapCenter[1], today, newLocation.category, newLocation.expiry_date, newLocation.notes
        ]
      });

      const newAdded = [...addedIds, id];
      setAddedIds(newAdded);
      localStorage.setItem('userAddedListings', JSON.stringify(newAdded));
      
      setShowAddForm(false);
      setNewLocation({ name: '', category: '🍛', price_range: '৳', expiry_date: '', notes: '', tags: [] });
      fetchLocations();
      showToast("✅ সফলভাবে যোগ করা হয়েছে");
    } catch (e) {
      console.error(e);
      showToast("❌ ব্যর্থ হয়েছে");
    } finally {
      setIsLoading(false);
    }
  };

  const MapEvents = () => {
    const map = useMap();
    const timerRef = useRef(null);

    useMapEvents({
      mousedown: (e) => {
        timerRef.current = setTimeout(() => {
          setMapCenter([e.latlng.lat, e.latlng.lng]);
          setShowAddForm(true);
          showToast("📍 নতুন পিন ড্রপ করা হয়েছে");
        }, 500);
      },
      mouseup: () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      },
      touchstart: (e) => {
        timerRef.current = setTimeout(() => {
          setMapCenter([e.latlng.lat, e.latlng.lng]);
          setShowAddForm(true);
        }, 500);
      },
      touchend: () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      }
    });
    return null;
  };


  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [toast, setToast] = useState(null);
  const [sheetSnap, setSheetSnap] = useState(0.25); // 0.25, 0.55, 0.92

  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setDeferredPrompt(null);
  };

  const [comments, setComments] = useState([]);
  const [isCommentsLoading, setIsCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState('');

  const [isDarkMode, setIsDarkMode] = useState(localStorage.getItem('theme') !== 'light');

  // --- Refs ---
  const sheetControls = useAnimation();
  const searchTimeout = useRef(null);

  // --- Effects ---
  useEffect(() => {
    // Session-based splash
    if (!sessionStorage.getItem('splash_shown')) {
      setShowSplash(true);
      sessionStorage.setItem('splash_shown', 'true');
      setTimeout(() => setShowSplash(false), 2000);
    }
    
    // Onboarding check
    if (!localStorage.getItem('onboarding_complete')) {
      setTimeout(() => setShowOnboarding(true), 2100);
    }

    initDb().then(fetchLocations);
    startLocationTracking();
  }, []);

  useEffect(() => {
    localStorage.setItem('recent_searches', JSON.stringify(recentSearches));
  }, [recentSearches]);

  useEffect(() => {
    localStorage.setItem('userBookmarks', JSON.stringify(savedIds));
  }, [savedIds]);

  useEffect(() => {
    document.documentElement.classList.toggle('light', !isDarkMode);
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  // --- Location Logic ---
  const startLocationTracking = () => {
    if (navigator.geolocation) {
      navigator.geolocation.watchPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserLocation(loc);
          if (activeTab === 'map' && !selectedLocation) {
            // Only update center if we just started or requested
          }
        },
        () => showToast("📍 দূরত্ব অজানা"),
        { enableHighAccuracy: true }
      );
    }
  };

  const fetchLocations = async () => {
    setIsLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const result = await db.execute({
        sql: "SELECT * FROM locations WHERE (expiry_date >= ? OR expiry_date = '' OR expiry_date IS NULL) ORDER BY created_at DESC",
        args: [today]
      });
      setLocations(result.rows);
      setFilteredLocations(result.rows);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const getDistanceAndTimes = useCallback((loc) => {
    if (!userLocation) return { dist: null, walk: null, drive: null };
    const d = calculateDistance(userLocation.lat, userLocation.lng, loc.lat, loc.lng);
    return {
      dist: d,
      walk: calculateTravelTime(d, WALKING_SPEED),
      drive: calculateTravelTime(d, DRIVING_SPEED)
    };
  }, [userLocation]);

  // --- Search Logic ---
  const handleSearch = (q) => {
    setSearchQuery(q);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    
    searchTimeout.current = setTimeout(() => {
      if (q.trim()) {
        const filtered = locations.filter(loc => 
          loc.name.toLowerCase().includes(q.toLowerCase()) || 
          loc.area.toLowerCase().includes(q.toLowerCase())
        );
        setFilteredLocations(filtered);
        if (!recentSearches.includes(q)) {
          setRecentSearches(prev => [q, ...prev.slice(0, 4)]);
        }
      } else {
        setFilteredLocations(locations);
      }
    }, 300);
  };

  // --- Action Handlers ---
  const toggleSave = (id) => {
    if (savedIds.includes(id)) {
      setSavedIds(prev => prev.filter(i => i !== id));
      showToast("🔖 রিমুভ করা হয়েছে");
    } else {
      setSavedIds(prev => [...prev, id]);
      showToast("🔖 সেভ করা হয়েছে");
    }
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const handleFinishOnboarding = () => {
    if (!tempUsername.trim()) return showToast("নাম লিখুন!");
    localStorage.setItem('bzone_username', tempUsername);
    localStorage.setItem('onboarding_complete', 'true');
    setUsername(tempUsername);
    setShowOnboarding(false);
  };

  const handleVote = async (id, type) => {
    if (voteCounts[id]) return showToast("ইতিমধ্যে ভোট দিয়েছেন");
    const field = type === 'up' ? 'upvotes' : 'downvotes';
    try {
      await db.execute({ sql: `UPDATE locations SET ${field} = ${field} + 1 WHERE id = ?`, args: [id] });
      setVoteCounts(prev => ({ ...prev, [id]: type }));
      localStorage.setItem('userVotes', JSON.stringify({ ...voteCounts, [id]: type }));
      fetchLocations();
      if (selectedLocation?.id === id) {
        setSelectedLocation({ ...selectedLocation, [field]: (selectedLocation[field] || 0) + 1 });
      }
      showToast("✅ ভোট সফল");
    } catch (e) {
      showToast("❌ ভোট ব্যর্থ");
    }
  };

  const fetchComments = async (locId) => {
    setIsCommentsLoading(true);
    try {
      const result = await db.execute({
        sql: "SELECT * FROM comments WHERE location_id = ? ORDER BY created_at DESC",
        args: [locId]
      });
      setComments(result.rows);
    } catch (e) {
      console.error(e);
    } finally {
      setIsCommentsLoading(false);
    }
  };

  const postComment = async () => {
    if (!newComment.trim() || !selectedLocation) return;
    try {
      const id = Math.random().toString(36).substr(2, 9);
      await db.execute({
        sql: "INSERT INTO comments (id, location_id, text) VALUES (?, ?, ?)",
        args: [id, selectedLocation.id, newComment]
      });
      setNewComment('');
      fetchComments(selectedLocation.id);
      showToast("💬 কমেন্ট সফল");
    } catch (e) {
      showToast("❌ কমেন্ট ব্যর্থ");
    }
  };

  const shareSpot = async (loc) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: loc.name,
          text: `${loc.name} - বিরিয়ানি Zone-এ দেখুন!`,
          url: window.location.href,
        });
      } catch (e) { console.error(e); }
    } else {
      showToast("📋 লিঙ্ক কপি করা হয়েছে");
      navigator.clipboard.writeText(window.location.href);
    }
  };

  // --- Sub-Components ---
  
  const ListingCard = ({ loc }) => {
    const stats = getDistanceAndTimes(loc);
    const voteRatio = loc.upvotes / (loc.upvotes + loc.downvotes || 1);
    const sentimentColor = loc.downvotes > loc.upvotes ? '#ef4444' : (loc.upvotes > 0 ? '#22c55e' : '#64748b');

    return (
      <motion.div 
        whileTap={{ scale: 0.97 }}
        onClick={() => { setSelectedLocation(loc); fetchComments(loc.id); }}
        className="bg-[#12121a] border border-white/5 p-4 rounded-3xl flex gap-4 items-center group active:bg-[#1a1a27] transition-all relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: sentimentColor }} />
        <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center text-3xl shrink-0">
          {loc.category || '🍛'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start">
            <h3 className="font-bold text-slate-100 truncate text-sm">{loc.name}</h3>
            <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded text-slate-500 font-mono">
              {loc.price_range || '৳'}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[9px] bg-orange-400/10 text-orange-400 px-1.5 py-0.5 rounded font-black uppercase tracking-tighter">
              {CATEGORIES.find(c => c.emoji === loc.category)?.label || 'খাবার'}
            </span>
            <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
              <MapPin size={10} /> <span>{formatDistance(stats.dist)}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
              🚶 {stats.walk ? `${stats.walk} মি` : '?'}
            </div>
            <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
              🚗 {stats.drive ? `${stats.drive} মি` : '?'}
            </div>
          </div>
        </div>
        <button 
          onClick={(e) => { e.stopPropagation(); toggleSave(loc.id); }}
          className={`p-2 rounded-xl ${savedIds.includes(loc.id) ? 'text-orange-400 bg-orange-400/10' : 'text-slate-600'}`}
        >
          <Bookmark size={18} fill={savedIds.includes(loc.id) ? "currentColor" : "none"} />
        </button>
      </motion.div>
    );
  };

  // --- Render ---

  if (showSplash) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0f] z-[9999] flex flex-col items-center justify-center">
        <motion.div 
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="text-center"
        >
          <div className="text-8xl mb-6">🍛</div>
          <h1 className="text-4xl font-black text-orange-400 font-syne tracking-tighter">BZone</h1>
          <p className="text-slate-500 font-bold mt-2">বিরিয়ানি Zone</p>
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
          <motion.div 
            key={onboardingStep}
            initial={{ x: 50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="space-y-6"
          >
            <div className="text-9xl mb-4">{slides[onboardingStep].icon}</div>
            <h2 className="text-4xl font-black">{slides[onboardingStep].title}</h2>
            <p className="text-slate-400 text-lg max-w-xs mx-auto">{slides[onboardingStep].desc}</p>
          </motion.div>
        </div>
        
        <div className="space-y-8">
          {onboardingStep === 2 && (
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="space-y-4">
              <input 
                placeholder="আপনার নাম" 
                value={tempUsername} 
                onChange={e => setTempUsername(e.target.value)}
                className="w-full bg-[#12121a] border border-white/10 rounded-2xl p-4 font-bold text-lg focus:border-orange-400 outline-none"
              />
            </motion.div>
          )}
          
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              {[0, 1, 2].map(i => (
                <div key={i} className={`onboarding-dot ${onboardingStep === i ? 'active' : ''}`} />
              ))}
            </div>
            <button 
              onClick={() => onboardingStep < 2 ? setOnboardingStep(onboardingStep + 1) : handleFinishOnboarding()}
              className="bg-orange-400 text-black px-6 py-3 rounded-2xl font-black flex items-center gap-2 tap-target"
            >
              {onboardingStep === 2 ? "শুরু করি" : "পরবর্তী"} <ArrowRight size={20} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-[#0a0a0f] text-slate-100 overflow-hidden relative">
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }}
            className="fixed bottom-24 inset-x-0 z-[6000] flex justify-center px-6 pointer-events-none"
          >
            <div className="bg-[#1a1a27] border border-white/10 px-6 py-3 rounded-full shadow-2xl flex items-center gap-2 text-sm font-bold">
              <Info size={16} className="text-orange-400" /> {toast}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Areas */}
      <main className="h-full w-full pb-[80px]">
        {activeTab === 'map' && (
          <div className="h-full w-full">
            <MapContainer 
              center={mapCenter} 
              zoom={mapZoom} 
              zoomControl={false} 
              className="h-full w-full dark-map"
            >
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <MapController center={mapCenter} zoom={mapZoom} />
              <MapEvents />
              
              {locations.map(loc => (
                <Marker 
                  key={loc.id} 
                  position={[loc.lat, loc.lng]} 
                  icon={getMarkerIcon(loc.category, loc.upvotes, loc.downvotes, selectedLocation?.id === loc.id)}
                  eventHandlers={{ click: () => { setSelectedLocation(loc); fetchComments(loc.id); } }}
                />
              ))}
              
              {userLocation && (
                <Circle center={[userLocation.lat, userLocation.lng]} radius={100} pathOptions={{ color: '#f5a623', fillColor: '#f5a623', fillOpacity: 0.2 }} />
              )}
            </MapContainer>
            
            {/* Snapable Bottom Sheet for Map Listing */}
            <motion.div 
              drag="y"
              dragConstraints={{ top: -window.innerHeight * 0.92, bottom: 0 }}
              dragElastic={0.1}
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
              <div className="p-6 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black">আশেপাশে {locations.length}টি স্পট</h2>
                  <p className="text-slate-500 text-xs font-bold">তালিকা টেনে উপরে আনুন</p>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                  <button 
                    onClick={() => setFilteredLocations(locations)}
                    className="bg-white/5 px-3 py-1.5 rounded-xl text-[10px] font-black whitespace-nowrap active:bg-orange-400 active:text-black"
                  >
                    সব
                  </button>
                  {CATEGORIES.map(c => (
                    <button 
                      key={c.id} 
                      onClick={() => setFilteredLocations(locations.filter(l => l.category === c.emoji))}
                      className="bg-white/5 px-3 py-1.5 rounded-xl text-[10px] font-black whitespace-nowrap active:bg-orange-400 active:text-black"
                    >
                      {c.emoji} {c.label}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto px-6 space-y-4 pb-12">
                {isLoading ? <SkeletonLoader /> : 
                  locations.map(loc => <ListingCard key={loc.id} loc={loc} />)
                }
              </div>
            </motion.div>
          </div>
        )}

        {activeTab === 'explore' && (
          <div className="h-full w-full p-6 safe-p-top overflow-y-auto">
            <h1 className="text-3xl font-black mb-6">Explore</h1>
            <div className="relative mb-6">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
              <input 
                placeholder="খাবার বা এলাকা খুঁজুন..."
                value={searchQuery}
                onChange={e => handleSearch(e.target.value)}
                className="w-full bg-[#12121a] border border-white/5 rounded-2xl py-4 pl-12 pr-4 font-bold outline-none focus:border-orange-400 transition-all"
              />
            </div>
            
            {recentSearches.length > 0 && (
              <div className="flex gap-2 flex-wrap mb-8">
                {recentSearches.map((s, i) => (
                  <button key={i} onClick={() => handleSearch(s)} className="bg-white/5 px-4 py-2 rounded-full text-xs font-bold text-slate-400">
                    {s}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 mb-8">
              {CATEGORIES.map(c => (
                <button 
                  key={c.id} 
                  onClick={() => {
                    const filtered = locations.filter(l => l.category === c.emoji);
                    setFilteredLocations(filtered);
                  }}
                  className="bg-[#12121a] p-4 rounded-3xl border border-white/5 flex flex-col items-center gap-2 press-scale active:border-orange-400/30"
                >
                  <span className="text-4xl">{c.emoji}</span>
                  <span className="font-bold text-sm">{c.label}</span>
                </button>
              ))}
            </div>

            <div className="space-y-4">
              <h2 className="text-xl font-black flex items-center gap-2">
                <MapPin size={20} className="text-orange-400" /> কাছের স্পট
              </h2>
              {filteredLocations.length === 0 ? (
                <div className="py-12 text-center text-slate-600 font-bold">কিছু পাওয়া যায়নি</div>
              ) : (
                [...filteredLocations]
                  .sort((a, b) => {
                    const distA = getDistanceAndTimes(a).dist || Infinity;
                    const distB = getDistanceAndTimes(b).dist || Infinity;
                    return distA - distB;
                  })
                  .map(loc => <ListingCard key={loc.id} loc={loc} />)
              )}
            </div>
          </div>
        )}

        {activeTab === 'saved' && (
          <div className="h-full w-full p-6 safe-p-top overflow-y-auto">
            <h1 className="text-3xl font-black mb-8">সেভ করা স্পট</h1>
            <div className="space-y-4">
              {savedIds.length === 0 ? (
                <div className="py-20 text-center space-y-4">
                  <div className="text-7xl">🔖</div>
                  <p className="text-slate-500 font-bold">এখনো কিছু সেভ করেননি</p>
                </div>
              ) : (
                locations.filter(l => savedIds.includes(l.id)).map(loc => <ListingCard key={loc.id} loc={loc} />)
              )}
            </div>
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="h-full w-full p-6 safe-p-top overflow-y-auto">
            <div className="flex items-center justify-between mb-8">
              <h1 className="text-3xl font-black">Profile</h1>
              <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-3 bg-white/5 rounded-2xl">
                {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
              </button>
            </div>

            <div className="bg-[#12121a] rounded-[40px] p-8 mb-8 text-center border border-white/5 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4">
                <Edit3 size={18} className="text-slate-600" />
              </div>
              <div className="w-24 h-24 bg-orange-400/10 rounded-full flex items-center justify-center text-5xl mx-auto mb-4 border-4 border-orange-400/20">
                {userAvatar}
              </div>
              <h2 className="text-2xl font-black mb-1">{username}</h2>
              <p className="text-slate-500 font-bold text-sm">BZone Member</p>
              
              <div className="grid grid-cols-3 gap-4 mt-8">
                <div>
                  <div className="text-xl font-black text-orange-400">{addedIds.length}</div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Added</div>
                </div>
                <div>
                  <div className="text-xl font-black text-orange-400">{Object.keys(voteCounts).length}</div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Votes</div>
                </div>
                <div>
                  <div className="text-xl font-black text-orange-400">{comments.filter(c => addedIds.includes(c.location_id)).length}</div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Rep</div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <h3 className="font-black text-lg flex items-center gap-2">
                <Award size={20} className="text-orange-400" /> অর্জিত ব্যাজ
              </h3>
              <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                {addedIds.length >= 3 && (
                  <div className="bg-orange-400/10 border border-orange-400/20 px-4 py-3 rounded-2xl shrink-0">
                    <div className="font-black text-orange-400">বিরিয়ানি এক্সপার্ট 🏆</div>
                  </div>
                )}
                {locations.filter(l => addedIds.includes(l.id) && l.category === '🕌').length >= 3 && (
                  <div className="bg-indigo-400/10 border border-indigo-400/20 px-4 py-3 rounded-2xl shrink-0">
                    <div className="font-black text-indigo-400">মসজিদ গাইড 🕌</div>
                  </div>
                )}
                <div className="bg-white/5 px-4 py-3 rounded-2xl shrink-0 opacity-40">
                  <div className="font-black">কমিউনিটি স্টার ⭐</div>
                </div>
              </div>
            </div>

            <div className="mt-8 space-y-4">
              <h3 className="font-black text-lg">আপনার দেয়া স্পট</h3>
              {locations.filter(l => addedIds.includes(l.id)).map(loc => <ListingCard key={loc.id} loc={loc} />)}
            </div>
          </div>
        )}
      </main>

      {/* Bottom Tab Navigation */}
      <nav className="bottom-tab-bar">
        <button onClick={() => setActiveTab('map')} className={`tab-item ${activeTab === 'map' ? 'active' : ''}`}>
          <div className="tab-icon-wrapper"><MapIcon size={24} /></div>
          <span className="text-[10px] font-black uppercase tracking-tighter">Map</span>
        </button>
        <button onClick={() => setActiveTab('explore')} className={`tab-item ${activeTab === 'explore' ? 'active' : ''}`}>
          <div className="tab-icon-wrapper"><Search size={24} /></div>
          <span className="text-[10px] font-black uppercase tracking-tighter">Explore</span>
        </button>
        
        <div className="flex-1 flex justify-center">
          <button 
            onClick={() => setShowAddForm(true)}
            className="add-tab-button press-scale ripple"
          >
            <Plus size={32} strokeWidth={3} />
          </button>
        </div>

        <button onClick={() => setActiveTab('saved')} className={`tab-item ${activeTab === 'saved' ? 'active' : ''}`}>
          <div className="tab-icon-wrapper"><Bookmark size={24} /></div>
          <span className="text-[10px] font-black uppercase tracking-tighter">Saved</span>
        </button>
        <button onClick={() => setActiveTab('profile')} className={`tab-item ${activeTab === 'profile' ? 'active' : ''}`}>
          <div className="tab-icon-wrapper"><User size={24} /></div>
          <span className="text-[10px] font-black uppercase tracking-tighter">Profile</span>
        </button>
      </nav>

      {/* Full Detail Bottom Sheet */}
      <AnimatePresence>
        {selectedLocation && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedLocation(null)} className="fixed inset-0 bg-black/80 z-[5000] backdrop-blur-sm" />
            <motion.div 
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed bottom-0 inset-x-0 bg-[#12121a] rounded-t-[40px] z-[5001] max-h-[95vh] flex flex-col safe-p-bottom"
            >
              <div className="sheet-drag-handle" />
              <div className="flex-1 overflow-y-auto px-8 pb-12">
                <div className="flex justify-between items-start mb-6">
                  <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center text-5xl">
                    {selectedLocation.category || '🍛'}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => toggleSave(selectedLocation.id)} className={`p-4 rounded-2xl ${savedIds.includes(selectedLocation.id) ? 'bg-orange-400 text-black' : 'bg-white/5 text-slate-400'}`}>
                      <Bookmark size={24} fill={savedIds.includes(selectedLocation.id) ? "currentColor" : "none"} />
                    </button>
                    <button onClick={() => setSelectedLocation(null)} className="p-4 bg-white/5 rounded-2xl text-slate-400"><X size={24} /></button>
                  </div>
                </div>

                <h1 className="text-3xl font-black mb-2">{selectedLocation.name}</h1>
                <div className="flex flex-wrap gap-2 mb-8">
                  <span className="bg-orange-400/10 text-orange-400 px-3 py-1 rounded-lg text-xs font-black">{selectedLocation.area}</span>
                  <span className="bg-white/5 text-slate-400 px-3 py-1 rounded-lg text-xs font-black">{selectedLocation.category || '🍛'}</span>
                  {TAG_OPTIONS.map(t => (
                    <span key={t.id} className="bg-white/5 text-slate-400 px-3 py-1 rounded-lg text-xs font-black">{t.label}</span>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-4 mb-8">
                  <div className="bg-[#1a1a27] p-4 rounded-3xl space-y-1">
                    <div className="text-[10px] font-black text-slate-500 uppercase">প্যাকেট</div>
                    <div className="text-2xl font-black text-orange-400">{selectedLocation.packets || '?'}</div>
                  </div>
                  <div className="bg-[#1a1a27] p-4 rounded-3xl space-y-1">
                    <div className="text-[10px] font-black text-slate-500 uppercase">সময়</div>
                    <div className="text-2xl font-black text-orange-400">{selectedLocation.time}</div>
                  </div>
                </div>

                <div className="flex gap-4 mb-10">
                  <button onClick={() => handleVote(selectedLocation.id, 'up')} className={`flex-1 py-5 rounded-3xl font-black flex items-center justify-center gap-2 transition-all ${voteCounts[selectedLocation.id] === 'up' ? 'bg-emerald-500 text-white' : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'}`}>
                    <CheckCircle size={20} /> সত্য ({selectedLocation.upvotes})
                  </button>
                  <button onClick={() => handleVote(selectedLocation.id, 'down')} className={`flex-1 py-5 rounded-3xl font-black flex items-center justify-center gap-2 transition-all ${voteCounts[selectedLocation.id] === 'down' ? 'bg-rose-500 text-white' : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'}`}>
                    <XCircle size={20} /> মিথ্যা ({selectedLocation.downvotes})
                  </button>
                </div>

                <div className="space-y-6 mb-12">
                  <h3 className="font-black text-lg flex items-center justify-between">
                    <span>মন্তব্য সমূহ</span>
                    <MessageSquare size={18} className="text-orange-400" />
                  </h3>
                  
                  <div className="flex gap-3">
                    <input 
                      value={newComment} onChange={e => setNewComment(e.target.value)}
                      placeholder="মতামত দিন..." 
                      className="flex-1 bg-[#1a1a27] border border-white/5 rounded-2xl px-4 py-3 outline-none focus:border-orange-400 transition-all"
                    />
                    <button onClick={postComment} className="bg-orange-400 text-black p-4 rounded-2xl"><Send size={20} /></button>
                  </div>

                  <div className="space-y-4">
                    {isCommentsLoading ? <div className="text-slate-600 font-bold">লোড হচ্ছে...</div> : 
                      comments.length === 0 ? <div className="text-slate-600 font-bold">এখনো কোনো মন্তব্য নেই</div> :
                      comments.map(c => (
                        <div key={c.id} className="bg-white/5 p-4 rounded-2xl border border-white/5">
                          <p className="text-slate-300 font-medium">{c.text}</p>
                          <span className="text-[10px] text-slate-600 mt-2 block font-mono">
                            {new Date(c.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                      ))
                    }
                  </div>
                </div>

                <button 
                  onClick={() => shareSpot(selectedLocation)}
                  className="w-full bg-white/5 py-4 rounded-2xl font-black flex items-center justify-center gap-2 border border-white/5"
                >
                  <Share2 size={20} /> শেয়ার করুন
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Add Listing Modal */}
      <AnimatePresence>
        {showAddForm && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAddForm(false)} className="fixed inset-0 bg-black/90 z-[5000] backdrop-blur-md" />
            <motion.div 
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              className="fixed bottom-0 inset-x-0 bg-[#12121a] rounded-t-[40px] z-[5001] max-h-[95vh] flex flex-col safe-p-bottom border-t border-white/10"
            >
              <div className="sheet-drag-handle" />
              <div className="p-8 overflow-y-auto">
                <div className="flex justify-between items-center mb-8">
                  <h1 className="text-2xl font-black">নতুন স্পট যোগ করুন</h1>
                  <button onClick={() => setShowAddForm(false)} className="p-2 text-slate-500"><X size={24}/></button>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">পিন সেট করুন</label>
                    <div className="h-40 rounded-3xl overflow-hidden border border-white/10 relative">
                      <MapContainer center={mapCenter} zoom={16} zoomControl={false} className="h-full w-full">
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                        <Marker position={mapCenter} icon={L.divIcon({ html: '<div class="text-3xl">📍</div>', className: '', iconAnchor: [15, 30] })} />
                        <MapController center={mapCenter} />
                      </MapContainer>
                      <div className="absolute inset-0 pointer-events-none border-2 border-orange-400/20 rounded-3xl" />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <input 
                      placeholder="নাম (উদা: বায়তুল মোকাররম মসজিদ)" 
                      value={newLocation.name}
                      onChange={e => setNewLocation({...newLocation, name: e.target.value})}
                      className="w-full bg-[#1a1a27] border border-white/5 p-4 rounded-2xl font-bold outline-none focus:border-orange-400" 
                    />
                    
                    <div className="grid grid-cols-2 gap-4">
                      <select 
                        value={newLocation.category}
                        onChange={e => setNewLocation({...newLocation, category: e.target.value})}
                        className="bg-[#1a1a27] border border-white/5 p-4 rounded-2xl font-bold appearance-none outline-none"
                      >
                        {CATEGORIES.map(c => <option key={c.id} value={c.emoji}>{c.emoji} {c.label}</option>)}
                      </select>
                      <select 
                        value={newLocation.price_range}
                        onChange={e => setNewLocation({...newLocation, price_range: e.target.value})}
                        className="bg-[#1a1a27] border border-white/5 p-4 rounded-2xl font-bold appearance-none outline-none"
                      >
                        {PRICE_RANGES.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      <input 
                        type="date"
                        value={newLocation.expiry_date}
                        onChange={e => setNewLocation({...newLocation, expiry_date: e.target.value})}
                        className="w-full bg-[#1a1a27] border border-white/5 p-4 rounded-2xl font-bold outline-none" 
                      />
                    </div>

                    <textarea 
                      placeholder="বিস্তারিত তথ্য (ঐচ্ছিক)"
                      value={newLocation.notes}
                      onChange={e => setNewLocation({...newLocation, notes: e.target.value})}
                      className="w-full bg-[#1a1a27] border border-white/5 p-4 rounded-2xl font-bold outline-none h-24 resize-none"
                    />

                    <div className="flex flex-wrap gap-2">
                      {TAG_OPTIONS.map(tag => (
                        <button
                          key={tag.id}
                          onClick={() => {
                            const tags = newLocation.tags.includes(tag.id) 
                              ? newLocation.tags.filter(t => t !== tag.id)
                              : [...newLocation.tags, tag.id];
                            setNewLocation({...newLocation, tags});
                          }}
                          className={`px-4 py-2 rounded-full text-[10px] font-black transition-all ${newLocation.tags.includes(tag.id) ? 'bg-orange-400 text-black' : 'bg-white/5 text-slate-500'}`}
                        >
                          {tag.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button 
                    onClick={handleAddSubmit}
                    disabled={isLoading}
                    className="w-full bg-orange-400 text-black py-5 rounded-3xl font-black text-xl shadow-2xl shadow-orange-400/20 active:scale-95 transition-all"
                  >
                    {isLoading ? "যোগ হচ্ছে..." : "যোগ করুন →"}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      {/* Install Banner */}
      <AnimatePresence>
        {deferredPrompt && (
          <motion.div 
            initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}
            className="fixed bottom-24 inset-x-6 z-[4500] bg-orange-400 text-black p-4 rounded-3xl flex items-center justify-between shadow-2xl"
          >
            <div className="flex items-center gap-3">
              <div className="text-2xl">📱</div>
              <div>
                <div className="font-black text-sm">Add to Home Screen</div>
                <div className="text-[10px] font-bold opacity-70">App-এর মতো ব্যবহার করুন</div>
              </div>
            </div>
            <button onClick={handleInstallClick} className="bg-black text-white px-4 py-2 rounded-xl font-black text-xs">ইন্সটল</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;
