import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { db, initDb } from './db';
import { Map as MapIcon, List, Plus, MapPin, CheckCircle, XCircle, Info, Navigation, Search, X, Loader2, MessageSquare, Send, Clock, Package, User, Hash } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Leaflet marker fix
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const DHAKA_COORDS = [23.6850, 90.3563];

// --- Icons ---
const mosqueIcon = L.divIcon({
  html: `<div class="marker-mosque flex items-center justify-center w-10 h-10 bg-white rounded-2xl shadow-xl border-2 border-slate-100 text-slate-400">
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10"/><path d="m22 10-10-8L2 10"/><path d="M6 22V10"/><path d="M18 22V10"/></svg>
  </div>`,
  className: '',
  iconSize: [40, 40],
  iconAnchor: [20, 20]
});

const plusIcon = L.divIcon({
  html: `<div class="marker-mosque flex items-center justify-center w-8 h-8 bg-orange-500 rounded-full shadow-lg border-2 border-white text-white">
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
  </div>`,
  className: '',
  iconSize: [32, 32],
  iconAnchor: [16, 16]
});

const getMarkerIcon = (upvotes, downvotes) => {
  const isFake = (downvotes - upvotes >= 5);
  const color = isFake ? '#ef4444' : '#059669';
  return L.divIcon({
    html: `<div class="marker-biryani flex items-center justify-center w-14 h-14 bg-white rounded-[20px] shadow-2xl border-4 border-slate-50 relative">
      <div style="background-color: ${color}" class="w-full h-full rounded-[16px] flex items-center justify-center text-2xl">🍛</div>
      <div class="absolute -top-2 -right-2 bg-emerald-600 text-white px-2 py-0.5 rounded-full text-[10px] font-black shadow-lg border-2 border-white">
        ${upvotes > 0 ? upvotes : ''}
      </div>
    </div>`,
    className: '',
    iconSize: [56, 56],
    iconAnchor: [28, 28]
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

const MosqueDetector = ({ onMosquesFound, setLoading }) => {
  const map = useMap();
  const fetchMosques = useCallback(async () => {
    setLoading(true);
    const bounds = map.getBounds();
    const query = `
      [out:json][timeout:25];
      (
        node["amenity"="place_of_worship"]["religion"="muslim"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
        way["amenity"="place_of_worship"]["religion"="muslim"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
      );
      out body center;
    `;
    try {
      const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error('Overpass failure');
      const data = await response.json();
      const mosques = data.elements.map(el => ({
        id: el.id,
        lat: el.lat || el.center.lat,
        lng: el.lon || el.center.lon,
        name: el.tags.name || el.tags['name:bn'] || el.tags['name:en'] || "মসজিদ"
      }));
      onMosquesFound(mosques);
    } catch (e) {
      console.error("Overpass error", e);
    } finally {
      setLoading(false);
    }
  }, [map, onMosquesFound, setLoading]);

  useMapEvents({ moveend: fetchMosques });
  useEffect(() => { fetchMosques(); }, []);
  return null;
};

const App = () => {
  const [view, setView] = useState('map');
  const [mapCenter, setMapCenter] = useState(DHAKA_COORDS);
  const [mapZoom, setMapZoom] = useState(15);
  const [locations, setLocations] = useState([]);
  const [mosques, setMosques] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [newLocation, setNewLocation] = useState({ name: '', area: '', distributor: '', time: '', packets: '', notes: '', lat: null, lng: null });

  // Add this hook inside App
  const MapClickHandler = () => {
    useMapEvents({
      click: async (e) => {
        const { lat, lng } = e.latlng;
        setIsLoading(true);
        try {
          // Reverse geocode to get a name/area for the tapped location
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
          const data = await res.json();
          const placeName = data.address.amenity || data.address.building || data.address.road || "নতুন স্থান";
          const area = data.address.suburb || data.address.neighbourhood || data.address.city || "ঢাকা";
          
          setNewLocation({ 
            ...newLocation, 
            name: `${placeName} (ম্যানুয়াল)`, 
            area: area,
            lat, 
            lng 
          });
          setShowForm(true);
          showToast("📍 ম্যাপ থেকে লোকেশন নেয়া হয়েছে");
        } catch (error) {
          setNewLocation({ ...newLocation, name: "ম্যানুয়াল লোকেশন", area: "ঢাকা", lat, lng });
          setShowForm(true);
        } finally {
          setIsLoading(false);
        }
      },
    });
    return null;
  };

  useEffect(() => {
    initDb();
    fetchTodayLocations();
    detectLocation();
  }, []);

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const detectLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          const coords = [p.coords.latitude, p.coords.longitude];
          setMapCenter(coords);
          showToast("📍 আপনার অবস্থান ব্যবহার করা হচ্ছে");
        },
        () => {
          setMapCenter(DHAKA_COORDS);
          showToast("🗺️ ঢাকায় দেখানো হচ্ছে");
        }
      );
    }
  };

  const fetchTodayLocations = async () => {
    const today = new Date().toISOString().split('T')[0];
    const result = await db.execute({
      sql: "SELECT * FROM locations WHERE date = ? ORDER BY upvotes DESC",
      args: [today]
    });
    setLocations(result.rows);
  };

  const fetchComments = async (locationId) => {
    try {
      const result = await db.execute({
        sql: "SELECT * FROM comments WHERE location_id = ? ORDER BY created_at DESC",
        args: [locationId]
      });
      setComments(result.rows);
    } catch (e) {
      console.error("Fetch comments error", e);
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || !selectedLocation) return;
    try {
      const id = Math.random().toString(36).substr(2, 9);
      await db.execute({
        sql: "INSERT INTO comments (id, location_id, text) VALUES (?, ?, ?)",
        args: [id, selectedLocation.id, newComment]
      });
      setNewComment('');
      fetchComments(selectedLocation.id);
      showToast("💬 কমেন্ট যোগ করা হয়েছে");
    } catch (e) {
      showToast("❌ কমেন্ট করা যায়নি");
    }
  };

  const handleVote = async (id, type) => {
    const field = type === 'up' ? 'upvotes' : 'downvotes';
    await db.execute({ sql: `UPDATE locations SET ${field} = ${field} + 1 WHERE id = ?`, args: [id] });
    fetchTodayLocations();
    if (selectedLocation?.id === id) {
      setSelectedLocation({ ...selectedLocation, [field]: (selectedLocation[field] || 0) + 1 });
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsLoading(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}+bangladesh&format=json&limit=5`);
      const data = await res.json();
      setSearchResults(data);
    } catch (e) {
      showToast("❌ সার্চ ব্যর্থ হয়েছে");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newLocation.lat) return showToast("📍 ম্যাপ থেকে একটি মসজিদ নির্বাচন করুন");
    
    // Auto-detect area if empty
    let area = newLocation.area;
    if (!area) {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${newLocation.lat}&lon=${newLocation.lng}&format=json`);
        const data = await res.json();
        area = data.address.suburb || data.address.neighbourhood || data.address.city || "ঢাকা";
      } catch (e) {
        area = "ঢাকা";
      }
    }

    try {
      const id = Math.random().toString(36).substr(2, 9);
      const today = new Date().toISOString().split('T')[0];
      await db.execute({
        sql: `INSERT INTO locations (id, name, area, distributor, time, packets, notes, lat, lng, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [id, newLocation.name, area, newLocation.distributor, newLocation.time, parseInt(newLocation.packets) || 0, newLocation.notes, newLocation.lat, newLocation.lng, today]
      });
      setShowForm(false);
      fetchTodayLocations();
      showToast("✅ সফলভাবে যোগ করা হয়েছে");
    } catch (e) {
      showToast("❌ ভুল হয়েছে");
    }
  };

  const centerOnUser = () => {
    setIsLoading(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          const coords = [p.coords.latitude, p.coords.longitude];
          setMapCenter(coords);
          setMapZoom(17);
          setIsLoading(false);
          showToast("📍 আপনার অবস্থান দেখানো হচ্ছে");
          
          // Force Leaflet map to update immediately
          setTimeout(() => {
            setMapZoom(18);
          }, 100);
        },
        (error) => {
          setIsLoading(false);
          console.error("Geo error:", error);
          showToast("❌ অবস্থান পাওয়া যায়নি। GPS চালু করুন।");
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      setIsLoading(false);
      showToast("❌ ব্রাউজার অবস্থান সাপোর্ট করে না");
    }
  };

  const funnyMessages = [
    "বিরিয়ানি প্রেমী, আজ আপনিই সেরা খবর দিবেন!",
    "মসজিদ খুঁজুন, সওয়াব আর বিরিয়ানি দুটোই পাবেন।",
    "খিদা লাগছে? ম্যাপে তাকান, বিরিয়ানি আপনার অপেক্ষায়!",
    "তথ্য দিন, অন্যকে বিরিয়ানি খেতে সাহায্য করুন।"
  ];

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden bg-[#f8fafc]">
      {/* Polished App Header */}
      <div className="app-header">
        <div className="header-content">
          <div className="logo-container">
            <span className="text-xl">🍛</span> 
            <span className="text-[#059669]">বিরিয়ানি দিবে</span>
          </div>
          <button onClick={() => setShowSearch(true)} className="search-trigger">
            <Search size={18} />
            <span>মসজিদ বা এলাকা খুঁজুন...</span>
          </button>
        </div>
        <div className="mt-2 flex gap-2">
          <div className="stats-badge shadow-sm">
            <Hash size={12} /> আজকের স্পট: {locations.length}টি
          </div>
          <div className="bg-white/80 backdrop-blur px-3 py-1 rounded-full text-[10px] font-bold text-slate-500 shadow-sm border border-slate-100 flex items-center gap-1">
            <Navigation size={10} className="text-emerald-500" /> ম্যাপে ট্যাপ করুন
          </div>
        </div>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 20 }} exit={{ opacity: 0 }} className="fixed top-24 inset-x-0 z-[5000] flex justify-center px-4">
            <div className="bg-[#0f172a] text-white px-6 py-3 rounded-2xl shadow-2xl font-bold text-sm border border-slate-700 flex items-center gap-2">
              <span>💡</span> {toast}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 relative">
        {view === 'map' ? (
          <>
            <MapContainer center={mapCenter} zoom={mapZoom} zoomControl={false} className="h-full w-full">
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OSM' />
              <MapController center={mapCenter} zoom={mapZoom} />
              <MapClickHandler />
              <MosqueDetector onMosquesFound={setMosques} setLoading={setIsLoading} />
              
              {locations.map(loc => (
                <Marker key={loc.id} position={[loc.lat, loc.lng]} icon={getMarkerIcon(loc.upvotes, loc.downvotes)} eventHandlers={{ click: () => { setSelectedLocation(loc); fetchComments(loc.id); } }} />
              ))}

              {mosques.map(m => {
                const hasBiryani = locations.some(l => l.lat === m.lat && l.lng === m.lng);
                if (hasBiryani) return null;
                return (
                  <Marker 
                    key={m.id} 
                    position={[m.lat, m.lng]} 
                    icon={plusIcon} 
                    eventHandlers={{ click: () => {
                      setNewLocation({ ...newLocation, name: m.name, area: '', lat: m.lat, lng: m.lng });
                      setShowForm(true);
                    }}} 
                  />
                );
              })}
            </MapContainer>

            {isLoading && (
              <div className="absolute top-32 left-1/2 -translate-x-1/2 z-[1000] bg-white/90 backdrop-blur-xl px-6 py-3 rounded-full shadow-2xl border border-emerald-100 flex items-center gap-3">
                <Loader2 className="animate-spin text-emerald-600" size={20} />
                <span className="font-black text-sm text-slate-800 animate-pulse">মসজিদ লোড হচ্ছে... 🕌</span>
              </div>
            )}
          </>
        ) : (
          <div className="h-full overflow-y-auto p-4 pt-32 pb-40">
            <div className="flex flex-col gap-1 mb-8">
              <div className="flex items-center justify-between">
                <h2 className="text-3xl font-black text-slate-900 tracking-tight">আজকের সক্রিয় স্পট</h2>
                <div className="bg-emerald-600 text-white px-4 py-1.5 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-100">
                  সরাসরি {locations.length}টি
                </div>
              </div>
              <p className="text-slate-400 font-medium text-sm">খুঁজে দেখুন আপনার কাছের প্রিয় বিরিয়ানি</p>
            </div>

            <div className="grid gap-5">
              {locations.length === 0 ? (
                <div className="text-center py-24 flex flex-col items-center gap-6 bg-white rounded-[40px] border-2 border-dashed border-slate-100">
                  <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center text-5xl">🕌</div>
                  <div>
                    <p className="text-slate-800 font-black text-xl mb-1">এখনো কোনো খবর নেই!</p>
                    <p className="text-slate-400 font-bold text-sm px-10 leading-relaxed">ম্যাপে গিয়ে কোনো মসজিদে ট্যাপ করে আজকে প্রথম খবরটি আপনিই দিন।</p>
                  </div>
                </div>
              ) : (
                locations.map((loc, index) => (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95, y: 20 }} 
                    animate={{ opacity: 1, scale: 1, y: 0 }} 
                    transition={{ delay: index * 0.05 }}
                    key={loc.id} 
                    className="group relative bg-white p-1 rounded-[32px] shadow-xl shadow-slate-200/50 border border-slate-100 active:scale-[0.98] transition-all" 
                    onClick={() => { setSelectedLocation(loc); fetchComments(loc.id); setView('map'); setMapCenter([loc.lat, loc.lng]); setMapZoom(18); }}
                  >
                    <div className="p-5">
                      <div className="flex justify-between items-start gap-4 mb-4">
                        <div className="flex-1">
                          <h3 className="font-black text-xl text-slate-800 leading-tight group-active:text-emerald-600 transition-colors">{loc.name}</h3>
                          <div className="flex items-center gap-1.5 text-slate-400 mt-2">
                            <MapPin size={14} className="text-emerald-500" />
                            <span className="text-xs font-bold uppercase tracking-wider">{loc.area}</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <div className="bg-emerald-50 text-emerald-700 px-4 py-2 rounded-2xl text-sm font-black shadow-sm border border-emerald-100/50 flex items-center gap-2">
                            <Clock size={14} strokeWidth={3} /> {loc.time}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3 pt-5 border-t border-slate-50">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-[9px] font-black text-slate-300 uppercase tracking-tighter">প্যাকেট</span>
                          <span className="font-black text-slate-700">{loc.packets || '?'}</span>
                        </div>
                        <div className="flex flex-col items-center gap-1 border-x border-slate-50">
                          <span className="text-[9px] font-black text-slate-300 uppercase tracking-tighter">ভোট</span>
                          <div className="flex gap-2">
                            <span className="text-emerald-600 font-black text-xs">✅ {loc.upvotes}</span>
                            <span className="text-rose-500 font-black text-xs">❌ {loc.downvotes}</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-center justify-center">
                          <div className="bg-slate-50 p-2 rounded-xl text-slate-400">
                            <MessageSquare size={16} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modern Bottom Nav */}
      <div className="fixed bottom-0 inset-x-0 z-[2000] safe-bottom">
        <div className="nav-glass mx-6 mb-6 rounded-[32px] flex justify-around items-center px-4 relative">
          <button onClick={() => setView('map')} className={`flex flex-col items-center gap-1.5 transition-all ${view === 'map' ? 'text-emerald-600' : 'text-slate-400'}`}>
            <div className={`p-2.5 rounded-2xl transition-all ${view === 'map' ? 'bg-emerald-50 scale-110 shadow-sm' : ''}`}>
              <MapIcon size={24} strokeWidth={view === 'map' ? 3 : 2} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest">ম্যাপ</span>
          </button>

          <div className="fab-container">
            <button onClick={() => { centerOnUser(); setView('map'); }} className="fab-button shadow-emerald-200">
              <Navigation size={28} strokeWidth={3} className="fill-current" />
            </button>
          </div>

          <button onClick={() => setView('list')} className={`flex flex-col items-center gap-1.5 transition-all ${view === 'list' ? 'text-emerald-600' : 'text-slate-400'}`}>
            <div className={`p-2.5 rounded-2xl transition-all ${view === 'list' ? 'bg-emerald-50 scale-110 shadow-sm' : ''}`}>
              <List size={24} strokeWidth={view === 'list' ? 3 : 2} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest">তালিকা</span>
          </button>
        </div>
        <div className="absolute bottom-2 inset-x-0 text-center pointer-events-none">
          <p className="text-[8px] font-bold text-slate-300 uppercase tracking-tighter">made by Jubaior Prince</p>
        </div>
      </div>

      {/* Details Sheet with Comments */}
      <AnimatePresence>
        {selectedLocation && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedLocation(null)} className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-[3000]" />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="fixed bottom-0 inset-x-0 bg-white rounded-t-[48px] z-[3001] shadow-2xl safe-bottom max-h-[85vh] flex flex-col">
              <div className="sheet-handle" />
              <div className="overflow-y-auto p-6 pb-24 flex-1">
                <div className="flex justify-between items-start mb-8">
                  <div className="flex-1 pr-4">
                    <h2 className="text-3xl font-black text-slate-900 mb-2 leading-tight break-words">{selectedLocation.name}</h2>
                    <div className="flex items-center gap-2 text-emerald-600 font-bold bg-emerald-50 w-fit px-4 py-1.5 rounded-2xl border border-emerald-100/50">
                      <MapPin size={18} /> {selectedLocation.area}
                    </div>
                  </div>
                  <button onClick={() => setSelectedLocation(null)} className="bg-slate-100 p-3 rounded-2xl text-slate-400 active:scale-90 transition-transform flex-shrink-0"><X size={24}/></button>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mb-8">
                  <div className="bg-emerald-500 p-5 rounded-[28px] shadow-lg shadow-emerald-100 border-2 border-white">
                    <div className="flex items-center gap-2 mb-2 text-white/80 font-black text-[10px] uppercase tracking-widest">
                      <Clock size={12} /> সময় / Time
                    </div>
                    <p className="font-black text-2xl text-white">{selectedLocation.time}</p>
                  </div>
                  <div className="bg-orange-500 p-5 rounded-[28px] shadow-lg shadow-orange-100 border-2 border-white">
                    <div className="flex items-center gap-2 mb-2 text-white/80 font-black text-[10px] uppercase tracking-widest">
                      <Package size={12} /> প্যাকেট / Packets
                    </div>
                    <p className="font-black text-2xl text-white">{selectedLocation.packets || '?'}</p>
                  </div>
                  <div className="bg-white p-5 rounded-[28px] border-2 border-slate-50 col-span-2 shadow-sm">
                    <div className="flex items-center gap-2 mb-2 text-slate-400 font-black text-[10px] uppercase tracking-widest">
                      <User size={12} /> পরিবেশক / Distributor
                    </div>
                    <p className="font-black text-lg text-slate-700">{selectedLocation.distributor || 'অজানা'}</p>
                  </div>
                </div>

                <div className="flex gap-4 mb-10">
                  <button onClick={() => { setView('map'); setMapCenter([selectedLocation.lat, selectedLocation.lng]); setMapZoom(18); setSelectedLocation(null); }} className="bg-slate-900 text-white p-5 rounded-[28px] shadow-xl active:scale-95 transition-all">
                    <Navigation size={24} />
                  </button>
                  <button onClick={() => handleVote(selectedLocation.id, 'up')} className="flex-1 bg-emerald-600 text-white font-black py-5 rounded-[28px] flex items-center justify-center gap-3 shadow-xl shadow-emerald-200 active:scale-95 transition-all">
                    <CheckCircle size={24} /> সত্য ({selectedLocation.upvotes})
                  </button>
                  <button onClick={() => handleVote(selectedLocation.id, 'down')} className="flex-1 bg-rose-50 text-rose-600 font-black py-5 rounded-[28px] flex items-center justify-center gap-3 active:scale-95 transition-all">
                    <XCircle size={24} /> ভুয়া ({selectedLocation.downvotes})
                  </button>
                </div>

                {/* Comments Section */}
                <div className="space-y-6">
                  <h3 className="text-lg font-black flex items-center gap-2 text-slate-800">
                    <MessageSquare size={20} className="text-emerald-500" /> কমেন্ট করুন
                  </h3>
                  <form onSubmit={handleAddComment} className="relative">
                    <input value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="কিছু বলতে চান?" className="input-field pr-16" />
                    <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 bg-slate-900 text-white p-3 rounded-2xl shadow-lg active:scale-90 transition-transform">
                      <Send size={18} />
                    </button>
                  </form>
                  <div className="space-y-4">
                    {comments.map(c => (
                      <div key={c.id} className="bg-slate-50 p-4 rounded-[20px] border border-slate-100">
                        <p className="text-slate-800 font-medium leading-relaxed">{c.text}</p>
                        <p className="text-[10px] text-slate-400 mt-2 font-bold uppercase tracking-widest">{new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                    ))}
                    {comments.length === 0 && (
                      <p className="text-center py-6 text-slate-300 font-bold text-sm">প্রথম কমেন্ট করুন!</p>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Add Form Sheet */}
      <AnimatePresence>
        {showForm && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowForm(false)} className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-[3000]" />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="fixed bottom-0 inset-x-0 bg-white rounded-t-[48px] p-8 pb-12 z-[3001] shadow-2xl safe-bottom max-h-[95vh] overflow-y-auto">
              <div className="sheet-handle" />
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-3xl font-black text-slate-900 leading-tight">নতুন খবর দিন! 🍛</h2>
                <button onClick={() => setShowForm(false)} className="bg-slate-100 p-3 rounded-2xl text-slate-400"><X size={24}/></button>
              </div>

                  {newLocation.lat && (
                    <div className="bg-slate-50 p-6 rounded-[32px] border-2 border-slate-100 mb-8 flex items-center gap-4">
                      <div className="bg-white p-3 rounded-2xl shadow-sm text-2xl">🕌</div>
                      <div className="flex-1">
                        <label className="block text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">স্থানের নাম / Location Name *</label>
                        <input required value={newLocation.name} onChange={e => setNewLocation({...newLocation, name: e.target.value})} placeholder="মসজিদ বা স্পটের নাম লিখুন" className="w-full bg-transparent font-black text-slate-800 text-lg outline-none border-b border-slate-200 focus:border-emerald-500" />
                        <button type="button" onClick={() => { setView('map'); setMapCenter([newLocation.lat, newLocation.lng]); setMapZoom(18); setShowForm(false); }} className="mt-2 text-[10px] font-bold text-emerald-600 uppercase flex items-center gap-1 bg-emerald-50 px-3 py-1 rounded-full w-fit">
                          <Navigation size={10} /> ম্যাপে দেখুন
                        </button>
                      </div>
                    </div>
                  )}
              
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-2">সময় / Time *</label>
                    <input required type="time" value={newLocation.time} onChange={e => setNewLocation({...newLocation, time: e.target.value})} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-2">প্যাকেট / Packets</label>
                    <input type="number" value={newLocation.packets} onChange={e => setNewLocation({...newLocation, packets: e.target.value})} placeholder="যেমন: ১০০" className="input-field" />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-2">এলাকা / Area *</label>
                  <input required value={newLocation.area} onChange={e => setNewLocation({...newLocation, area: e.target.value})} placeholder="যেমন: ধানমন্ডি" className="input-field" />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-2">পরিবেশক / Distributor</label>
                  <input value={newLocation.distributor} onChange={e => setNewLocation({...newLocation, distributor: e.target.value})} placeholder="কে বিরিয়ানি দিচ্ছে?" className="input-field" />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-2">নোট / Notes</label>
                  <textarea value={newLocation.notes} onChange={e => setNewLocation({...newLocation, notes: e.target.value})} placeholder="অতিরিক্ত কোনো তথ্য থাকলে দিন..." className="input-field min-h-[120px] resize-none" />
                </div>

                <button type="submit" className="w-full bg-emerald-700 text-white font-black py-6 rounded-[32px] shadow-2xl shadow-emerald-200 active:scale-[0.98] transition-all text-xl">
                  নিশ্চিত করুন 🚀
                </button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Search Sheet */}
      <AnimatePresence>
        {showSearch && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSearch(false)} className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-[3000]" />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="fixed bottom-0 inset-x-0 bg-white rounded-t-[48px] p-8 pb-12 z-[3001] shadow-2xl safe-bottom max-h-[85vh] flex flex-col">
              <div className="sheet-handle" />
              <div className="flex items-center gap-4 mb-8">
                <form onSubmit={handleSearch} className="flex-1 relative">
                  <input autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="মসজিদ খুঁজুন (যেমন: বায়তুল মোকাররম)" className="input-field pr-16" />
                  <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 bg-emerald-600 text-white p-3 rounded-2xl shadow-xl shadow-emerald-100">
                    <Search size={24} />
                  </button>
                </form>
                <button onClick={() => setShowSearch(false)} className="bg-slate-100 p-4 rounded-2xl text-slate-400"><X size={24}/></button>
              </div>

              <div className="space-y-3 overflow-y-auto flex-1 pr-2">
                {searchResults.map((res, i) => (
                  <button key={i} onClick={() => {
                    setMapCenter([parseFloat(res.lat), parseFloat(res.lon)]);
                    setMapZoom(17);
                    setShowSearch(false);
                    setView('map');
                  }} className="w-full text-left p-5 rounded-[28px] bg-slate-50 border border-slate-100 active:bg-emerald-50 active:border-emerald-100 transition-all group">
                    <div className="flex items-center gap-4">
                      <div className="bg-white p-3 rounded-xl shadow-sm text-lg group-active:scale-90 transition-transform">🕌</div>
                      <div className="flex-1 overflow-hidden">
                        <p className="font-black text-slate-800 truncate">{res.display_name.split(',')[0]}</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1 truncate">{res.display_name.split(',').slice(1, 3).join(',')}</p>
                      </div>
                    </div>
                  </button>
                ))}
                {searchResults.length === 0 && searchQuery && !isLoading && (
                  <div className="text-center py-20 flex flex-col items-center gap-4">
                    <span className="text-6xl opacity-10">🔍</span>
                    <p className="text-slate-400 font-bold">কিছু খুঁজে পাওয়া যায়নি।<br/>অন্যভাবে চেষ্টা করুন!</p>
                  </div>
                )}
                {isLoading && (
                  <div className="flex justify-center py-20">
                    <Loader2 className="animate-spin text-emerald-600" size={48} />
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;
