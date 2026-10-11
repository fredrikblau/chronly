/**
 * Major cities that have no IANA zone of their own, mapped to the zone they
 * keep time with. Offsets and DST rules still come from the browser's tzdata;
 * this only maps a name someone is likely to type onto a zone id, so it cannot
 * go stale the way a bundled offset table would.
 *
 * Keys are lower case. Adding a city is a welcome first contribution — keep it
 * to places people commonly coordinate with, and only where the city is not
 * already the last segment of a zone id (Tokyo, Paris, and Sydney already are).
 */
export const CITY_ALIASES: Record<string, string> = {
  'san francisco': 'America/Los_Angeles',
  'silicon valley': 'America/Los_Angeles',
  seattle: 'America/Los_Angeles',
  'san diego': 'America/Los_Angeles',
  portland: 'America/Los_Angeles',
  'las vegas': 'America/Los_Angeles',
  austin: 'America/Chicago',
  dallas: 'America/Chicago',
  houston: 'America/Chicago',
  atlanta: 'America/New_York',
  boston: 'America/New_York',
  miami: 'America/New_York',
  washington: 'America/New_York',
  'washington dc': 'America/New_York',
  philadelphia: 'America/New_York',
  montreal: 'America/Toronto',
  ottawa: 'America/Toronto',
  'rio de janeiro': 'America/Sao_Paulo',
  munich: 'Europe/Berlin',
  frankfurt: 'Europe/Berlin',
  hamburg: 'Europe/Berlin',
  barcelona: 'Europe/Madrid',
  milan: 'Europe/Rome',
  geneva: 'Europe/Zurich',
  manchester: 'Europe/London',
  edinburgh: 'Europe/London',
  'tel aviv': 'Asia/Jerusalem',
  mumbai: 'Asia/Kolkata',
  bombay: 'Asia/Kolkata',
  delhi: 'Asia/Kolkata',
  'new delhi': 'Asia/Kolkata',
  bangalore: 'Asia/Kolkata',
  bengaluru: 'Asia/Kolkata',
  hyderabad: 'Asia/Kolkata',
  chennai: 'Asia/Kolkata',
  beijing: 'Asia/Shanghai',
  shenzhen: 'Asia/Shanghai',
  guangzhou: 'Asia/Shanghai',
  osaka: 'Asia/Tokyo',
  kyoto: 'Asia/Tokyo',
  'ho chi minh city': 'Asia/Ho_Chi_Minh',
  saigon: 'Asia/Ho_Chi_Minh',
  hanoi: 'Asia/Bangkok',
  canberra: 'Australia/Sydney',
  wellington: 'Pacific/Auckland',
}
