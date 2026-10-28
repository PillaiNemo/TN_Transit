import { BedDouble, Cctv, Droplets, GlassWater, Lamp, MapPin, PlugZap, Sparkles, UtensilsCrossed, Wifi } from 'lucide-react';

// Icons for the amenity names stored in the amenities table (display only).
const ICONS: Record<string, typeof Wifi> = {
  'Charging Point': PlugZap, 'Water Bottle': GlassWater, Blanket: BedDouble, 'Reading Light': Lamp,
  'Live Tracking': MapPin, CCTV: Cctv, 'Wi-Fi': Wifi, 'Pantry Car': UtensilsCrossed, Bedroll: BedDouble, 'Bio Toilet': Droplets,
};

export function AmenityIcon({ name, className = 'size-4' }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Sparkles;
  return <Icon className={className} aria-label={name} />;
}
