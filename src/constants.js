export const DHAKA_COORDS = [23.8103, 90.4125];

export const CATEGORIES = [
  { id: 'biryani', label: 'বিরিয়ানি', emoji: '🍛', color: '#f5a623' },
  { id: 'mosque', label: 'মসজিদ', emoji: '🕌', color: '#818cf8' },
  { id: 'khichuri', label: 'খিচুড়ি', emoji: '🥘', color: '#f59e0b' },
  { id: 'iftar', label: 'ইফতার', emoji: '🌙', color: '#f43f5e' },
  { id: 'water', label: 'পানি/শরবত', emoji: '🥤', color: '#0ea5e9' },
  { id: 'other', label: 'অন্যান্য', emoji: '🎁', color: '#64748b' },
];

export const TAG_OPTIONS = [
  { id: 'spicy', label: 'spicy 🌶️' },
  { id: 'halal', label: 'halal ✅' },
  { id: 'family', label: 'family-friendly 👨‍👩‍👧' },
  { id: 'late', label: 'open late 🌙' }
];

export const WALKING_SPEED = 5; // km/h
export const DRIVING_SPEED = 30; // km/h

export const BENGALI_NUMBERS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '⁸', '৯'];
export const toBengaliNumber = (num) => {
  if (num === undefined || num === null) return '০';
  return num.toString().split('').map(d => BENGALI_NUMBERS[d] || d).join('');
};
