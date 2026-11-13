import type { VerifiedVenue, BudgetTier } from '../types/itinerary';

type Cat = VerifiedVenue['category'];
type Slot = VerifiedVenue['timeSlot'];

/**
 * Compact catalogue rows. Hours/coordinates are approximate curated values — the
 * live Places pipeline (server/places.ts) supersedes them when API keys are set.
 */
type Row = [
  id: string, city: string, name: string, cat: Cat, sub: string, hood: string,
  lat: number, lng: number, slot: Slot, dur: number, price: BudgetTier, rating: number,
  opens: string, closes: string, indoor: boolean, noise: string, why: string, perk: string,
  tags?: string[]
];

const ROWS: Row[] = [
  // ---- Jaipur
  ['jaipur_jantar_mantar','jaipur','Jantar Mantar Observatory','culture','Open-air Observatory','Pink City',26.9248,75.8246,'morning',60,'₹',4.6,'09:00','16:30',false,'Quiet courtyard, soft guide murmur','A UNESCO-listed collection of giant stone instruments — easy to explore at your own pace.','Plenty of shaded benches; nobody minds if you linger alone.'],
  ['jaipur_city_palace','jaipur','City Palace Jaipur','culture','Royal Palace Museum','Pink City',26.9258,75.8237,'afternoon',90,'₹₹',4.6,'09:30','17:00',true,'Hushed courtyards','Courtyards, textile galleries and the Chandra Mahal, all within a short walk of each other.','Audio guide lets you set your own pace without a group.',['steps']],
  ['jaipur_lmb','jaipur','Laxmi Misthan Bhandar (LMB)','dining','Vegetarian Thali & Sweets','Johari Bazaar',26.9186,75.8197,'lunch',60,'₹₹',4.3,'08:00','22:30',true,'Busy family-hall hum','A long-running vegetarian restaurant on Johari Bazaar, known for thalis and ghewar.','Single-seat tables are easy to get at off-peak hours.'],
  ['jaipur_johari_bazaar','jaipur','Johari Bazaar Evening Browse','market','Jewellery & Textile Market','Johari Bazaar',26.9197,75.8233,'evening',60,'₹',4.4,'10:30','20:00',false,'Lively but friendly','Lantern-lit arcades with block-print fabrics and silver, busy and well-lit in the evening.','Crowded main lane keeps it comfortable after dusk; stick to the arcade.',[]],
  ['jaipur_albert_hall','jaipur','Albert Hall Museum','culture','Indo-Saracenic Museum','Ram Niwas Garden',26.9117,75.8194,'afternoon',75,'₹',4.5,'09:00','17:00',true,'Calm gallery hush','A grand Indo-Saracenic building with a quiet collection of miniatures and carpets.','Garden benches outside are good for a solo breather.'],
  // ---- Goa (Panjim)
  ['goa_immaculate_church','goa','Church of Our Lady of the Immaculate Conception','culture','Landmark Church','Panjim',15.4986,73.8312,'morning',40,'₹',4.7,'09:30','17:30',false,'Calm plaza murmur','A whitewashed 1541 church at the top of a zig-zag staircase.','Quiet steps with a clear view over the square.',['steps']],
  ['goa_panjim_market','goa','Panjim Municipal Market','market','Fresh Market','Panjim',15.4989,73.8303,'morning',50,'₹',4.2,'07:00','19:30',true,'Busy morning bustle','Spices, fruit and fresh fish stalls; a good way to see local life.','Easy to browse solo; stallholders are used to single visitors.'],
  ['goa_viva_panjim','goa','Viva Panjim','dining','Goan Home Cooking','Fontainhas',15.4966,73.8318,'lunch',70,'₹₹',4.4,'12:00','22:30',true,'Warm small-restaurant buzz','A small Fontainhas restaurant serving Goan home-style dishes.','Small tables for one are normal here.',['non_veg']],
  ['goa_state_museum','goa','Goa State Museum','culture','State Museum','Patto',15.4962,73.8266,'afternoon',70,'₹',4.2,'09:30','17:30',true,'Hushed galleries','Galleries on Goan history and Christian art.','Air-conditioned and quiet in the afternoon heat.'],
  // ---- Bengaluru
  ['blr_lalbagh','bengaluru','Lalbagh Botanical Garden','walk','Botanical Garden','Lalbagh',12.9507,77.5848,'morning',80,'₹',4.5,'06:00','19:00',false,'Birdsong and breeze','An 18th-century garden with old trees, a glasshouse and a lake.','Benches in shade throughout; easy to wander without a plan.'],
  ['blr_mtr','bengaluru','Mavalli Tiffin Rooms (MTR)','dining','South Indian Breakfast & Meals','Lalbagh Road',12.9553,77.5855,'lunch',60,'₹₹',4.4,'07:00','20:30',true,'Busy heritage dining hall','A 1924 institution known for dosas, rava idli and filter coffee.','Shared tables are normal, so eating alone feels natural.'],
  ['blr_tipu_palace','bengaluru','Tipu Sultan’s Summer Palace','culture','Historic Palace','Chamrajpet',12.9593,77.5737,'afternoon',50,'₹',4.2,'08:30','17:30',true,'Quiet wooden halls','A teak palace with painted pillars and a small museum.','Short visit with calm, uncrowded halls.'],
  ['blr_commercial_street','bengaluru','Commercial Street Browse','market','Shopping Street','Shivajinagar',12.9824,77.6083,'evening',60,'₹₹',4.2,'10:00','21:00',false,'Lively shopping crowd','A busy lane of clothing, jewellery and street snacks, well-lit into the evening.','High foot traffic, so it feels comfortable after dark.'],
  // ---- Varanasi
  ['vns_kashi_vishwanath','varanasi','Kashi Vishwanath Temple & Corridor','culture','Riverside Temple Complex','Godowlia',25.3109,83.0107,'morning',75,'₹',4.8,'04:00','22:00',false,'Devotional chanting','The riverside corridor makes the temple much easier to reach on foot.','Queues move steadily; go early for a calmer visit.',['steps']],
  ['vns_kachori_gali','varanasi','Kachori Gali Breakfast','dining','Street Breakfast','Vishwanath Gali',25.3104,83.0094,'morning',40,'₹',4.3,'06:00','12:00',true,'Fast, friendly lane bustle','Kachori-sabzi and jalebi from the lane’s long-standing stalls.','Stand-and-eat counters are ideal for one.'],
  ['vns_kashi_chat','varanasi','Kashi Chat Bhandar','dining','Chaat & Sweets','Godowlia',25.3090,83.0100,'lunch',45,'₹',4.4,'11:00','22:00',true,'Busy counter chatter','Tamatar chaat and lassi near Godowlia Chowk.','Counter service, no table needed.'],
  ['vns_tulsi_manas','varanasi','Tulsi Manas Mandir','culture','Temple','Durgakund',25.2918,82.9992,'afternoon',45,'₹',4.6,'05:30','21:00',false,'Calm temple garden','A white marble temple with verses of the Ramcharitmanas on the walls.','Quiet shaded garden for sitting.'],
  // ---- Mumbai
  ['bom_gateway','mumbai','Gateway of India Waterfront','viewpoint','Harbour Landmark','Colaba',18.9220,72.8347,'morning',45,'₹',4.6,'00:00','23:59',false,'Harbour breeze','The 1924 arch facing the harbour — best in the quieter morning light.','Open waterfront with plenty of people around.'],
  ['bom_kyani','mumbai','Kyani & Co.','cafe','Irani Café','Marine Lines',18.9438,72.8280,'lunch',45,'₹',4.2,'08:00','22:00',true,'Clinking tea glasses','A 1904 Irani café known for mawa cake and chai.','Small marble tables work well for one.'],
  ['bom_crawford_market','mumbai','Crawford Market','market','Historic Market','Fort',18.9473,72.8341,'afternoon',55,'₹',4.2,'11:00','20:00',true,'Busy market bustle','A Victorian market with fruit, spices and pet stalls.','Go with a rough plan; keep to the main aisles.'],
  ['bom_haji_ali','mumbai','Haji Ali Dargah Causeway','viewpoint','Sea Dargah','Worli',18.9827,72.8089,'evening',50,'₹',4.6,'05:30','22:00',false,'Sea spray and qawwali echoes','A white shrine reached by a causeway across the water.','Busy and well-lit into the evening; the causeway is passable at low tide.'],
  // ---- Udaipur
  ['udr_city_palace','udaipur','City Palace Udaipur','culture','Lakeside Palace Museum','Old City',24.5764,73.6835,'morning',100,'₹₹',4.6,'09:30','17:30',true,'Hushed palace courtyards','A palace complex above Lake Pichola with courtyards, murals and views.','Self-guided audio keeps pace flexible.',['steps']],
  ['udr_jagdish_temple','udaipur','Jagdish Temple','culture','Temple','Old City',24.5788,73.6836,'morning',35,'₹',4.6,'05:00','22:00',false,'Soft chanting','A 17th-century Indo-Aryan temple at the top of a steep staircase.','Quiet side steps for sitting and watching.',['steps','steep']],
  ['udr_gangaur_ghat','udaipur','Gangaur Ghat Lakefront Walk','walk','Lakeside Ghat','Old City',24.5786,73.6823,'afternoon',50,'₹',4.5,'00:00','23:59',false,'Gentle lake sounds','A calm ghat with views of the lake palaces and small bridge.','Seating along the ghat; many solo travelers pass through.'],
  ['udr_saheliyon','udaipur','Saheliyon-ki-Bari Garden','walk','Fountain Garden','Fatehpura',24.5990,73.6818,'afternoon',50,'₹',4.3,'09:00','19:00',false,'Fountains and birdsong','A shaded garden with fountains, lotus pools and marble pavilions.','Benches in shade throughout.'],
  ['udr_ambrai','udaipur','Ambrai Restaurant','dining','Lakeside Dining','Amet Haveli',24.5812,73.6800,'lunch',70,'₹₹₹',4.3,'12:00','23:00',true,'Soft lakeside ambience','A lakeside terrace restaurant facing the City Palace.','Terrace tables for one with a view.',['alcohol']],
  ['udr_bagore','udaipur','Bagore Ki Haveli','culture','Heritage Haveli','Gangaur Ghat',24.5798,73.6812,'evening',60,'₹',4.4,'10:00','19:00',true,'Calm haveli rooms','A restored 18th-century haveli with a puppet and costume museum.','Quiet rooms with seating; an evening dance show runs nearby.'],
  ['udr_pichola_boat','udaipur','Lake Pichola Boat Ride','viewpoint','Boat Ride','Bansi Ghat',24.5760,73.6800,'evening',45,'₹₹',4.5,'09:00','18:00',false,'Soft water sounds','A short boat ride with views of the City Palace and lake palaces at golden hour.','Shared boats are common; easy to join solo.',['steps']],
  ['udr_monsoon_palace','udaipur','Sajjangarh Monsoon Palace','viewpoint','Hilltop Palace','Sajjangarh',24.5984,73.6486,'evening',60,'₹₹',4.4,'09:30','17:30',false,'Mountain breeze','A hilltop palace with wide views across the city and lakes.','Reached by taxi; the viewpoint closes near sunset.',['steep']],
  // ---- Kochi
  ['koc_fishing_nets','kochi','Chinese Fishing Nets','viewpoint','Waterfront Landmark','Fort Kochi',9.9658,76.2415,'evening',45,'₹',4.4,'00:00','23:59',false,'Waterfront bustle','Cantilevered fishing nets along the shore, atmospheric at sunset.','Open and busy with vendors and walkers.'],
  ['koc_mattancherry','kochi','Mattancherry (Dutch) Palace','culture','Palace Museum','Mattancherry',9.9577,76.2594,'morning',60,'₹',4.2,'10:00','17:00',true,'Quiet murals and halls','A Portuguese-built palace with well-preserved Kerala murals. Closed Fridays.','Short visit with seating in the galleries.'],
  ['koc_jew_town','kochi','Jew Town & Paradesi Synagogue','culture','Heritage Street','Jew Town',9.9568,76.2593,'afternoon',60,'₹',4.4,'10:00','17:00',false,'Antique shop hush','Antique and spice shops on a lane leading to the 1568 synagogue. Closed Saturdays.','Small shops, easy to browse alone.'],
  ['koc_kashi_art_cafe','kochi','Kashi Art Café','cafe','Gallery Café','Fort Kochi',9.9650,76.2430,'lunch',60,'₹₹',4.4,'08:30','19:30',true,'Soft gallery chatter','A gallery café known for cakes, coffee and small plates.','Communal and small tables; reading alone is normal.'],
  ['koc_st_francis','kochi','St. Francis Church','culture','Historic Church','Fort Kochi',9.9658,76.2433,'morning',30,'₹',4.4,'09:00','18:00',true,'Quiet, cool interior','One of India’s oldest European-built churches.','Short, quiet stop with benches.'],
  ['koc_kathakali','kochi','Kathakali Performance (Fort Kochi)','culture','Dance Performance','Fort Kochi',9.9640,76.2425,'evening',90,'₹₹',4.5,'17:00','20:30',true,'Drums and stage hush','Evening Kathakali shows, including the make-up demonstration beforehand.','Seated single tickets are easy to get.'],
  ['koc_beach','kochi','Fort Kochi Beach & Parade Ground','walk','Seafront Walk','Fort Kochi',9.9653,76.2397,'afternoon',50,'₹',4.2,'00:00','23:59',false,'Sea breeze','A wide seafront promenade with food stalls.','Open and populated at golden hour.'],
  ['koc_teapot','kochi','Teapot Café','cafe','Tea Café','Fort Kochi',9.9646,76.2427,'afternoon',45,'₹₹',4.3,'09:00','19:00',true,'Soft teapot clatter','A tea-themed café on Peter Celli Street.','Small tables are fine for one.']
];

const cleanName = (n: string) => n.replace(/[^\w ]/g, '').trim().replace(/\s+/g, '+');

export function buildExtraVenues(heroByCity: Record<string, string>): VerifiedVenue[] {
  return ROWS.map(([id, city, name, cat, sub, hood, lat, lng, slot, dur, price, rating, opens, closes, indoor, noise, why, perk, tags]) => ({
    placeId: `pl_${id}`,
    cityId: city,
    name,
    category: cat,
    subCategory: sub,
    neighborhood: hood,
    address: `${hood}, ${city[0].toUpperCase() + city.slice(1)}`,
    coords: { lat, lng },
    timeSlot: slot,
    suggestedDuration: dur,
    bufferAfter: 20,
    priceLevel: price,
    rating,
    reviewsCount: 2000,
    openHoursToday: '',
    opensAt: opens,
    closesAt: closes,
    isIndoor: indoor,
    hasPlugs: cat === 'cafe' || (cat === 'dining' && indoor),
    noiseLevel: noise,
    whyItFits: why,
    soloPerk: perk,
    transitFromPrev: '',
    imageUrl: heroByCity[city] ?? '',
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${cleanName(name)}`,
    appleMapsUrl: `https://maps.apple.com/?ll=${lat},${lng}&q=${cleanName(name)}`,
    tags: tags ?? []
  }));
}
